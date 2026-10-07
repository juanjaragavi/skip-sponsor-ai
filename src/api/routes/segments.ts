import type { FastifyInstance } from "fastify";
import {
  getSegmentsParamsSchema,
  analyzeRequestSchema,
  correctionRequestSchema,
  videoIdSchema,
} from "../../shared/validators";
import type { VideoAnalysis } from "../../shared/types";
import type { SegmentRepository } from "../repositories/segment-repository";
import { fetchTimedText } from "../services/transcript-fetcher";
import { parseTimedText, chunkTranscript, transcriptHash } from "../services/chunker";
import { classifyChunks } from "../services/llm-client";
import {
  candidatesToSegments,
  mergeCandidates,
} from "../services/segment-classifier";
import { fetchSponsorBlock } from "../services/sponsorblock";

const inflight = new Map<string, Promise<VideoAnalysis>>();

export function registerSegmentRoutes(
  app: FastifyInstance,
  repo: SegmentRepository
): void {
  app.get("/v1/segments/:videoId", async (req, reply) => {
    const params = getSegmentsParamsSchema.parse(req.params);
    const cached = await repo.get(params.videoId);
    if (cached) return reply.send(toResponse(cached));
    const analysis = await analyzeVideo(
      repo,
      params.videoId,
      null,
      "en",
      false
    );
    return reply.send(toResponse(analysis));
  });

  app.post("/v1/segments:analyze", async (req, reply) => {
    const body = analyzeRequestSchema.parse(req.body);
    if (!body.force) {
      const cached = await repo.get(body.videoId);
      if (cached) return reply.code(200).send(toResponse(cached));
    }
    const analysis = await analyzeVideo(
      repo,
      body.videoId,
      body.channelId ?? null,
      body.languageHint ?? "en",
      body.force ?? false
    );
    return reply.send(toResponse(analysis));
  });

  app.post("/v1/segments/:videoId/corrections", async (req, reply) => {
    const { videoId } = zParams(req.params);
    const body = correctionRequestSchema.parse(req.body);
    const existing = await repo.get(videoId);
    if (!existing) return reply.code(404).send(problem(404, "Not found", videoId));
    const seg = {
      id: crypto.randomUUID(),
      videoId,
      channelId: existing.segments[0]?.channelId ?? null,
      startTime: body.startTime,
      endTime: body.endTime,
      confidence: 1,
      category: body.category,
      source: "manual" as const,
      createdAt: new Date().toISOString(),
    };
    await repo.put({ ...existing, segments: [...existing.segments, seg] });
    return reply.code(201).send({ id: seg.id, status: "accepted" });
  });

  app.delete("/v1/segments/:videoId", async (req, reply) => {
    const { videoId } = zParams(req.params);
    const existing = await repo.get(videoId);
    if (!existing) return reply.code(404).send(problem(404, "Not found", videoId));
    await repo.put({ ...existing, segments: [], status: "unanalyzable" });
    return reply.code(204).send();
  });
}

function zParams(params: unknown): { videoId: string } {
  return { videoId: videoIdSchema.parse((params as { videoId: string }).videoId) };
}

function toResponse(a: VideoAnalysis): unknown {
  return {
    videoId: a.videoId,
    status: a.status,
    duration: a.duration,
    language: a.language,
    segments: a.segments,
    analyzedAt: a.analyzedAt,
  };
}

function problem(status: number, title: string, instance: string): unknown {
  return {
    type: `https://api.skipsponsor.example.com/problems/${status}`,
    title,
    status,
    detail: title,
    instance: `/v1/segments/${instance}`,
  };
}

async function analyzeVideo(
  repo: SegmentRepository,
  videoId: string,
  channelId: string | null,
  lang: string,
  force: boolean
): Promise<VideoAnalysis> {
  if (!force) {
    const cached = await repo.get(videoId);
    if (cached) return cached;
  }
  if (inflight.has(videoId)) return inflight.get(videoId)!;
  const p = runAnalysis(repo, videoId, channelId, lang);
  inflight.set(videoId, p);
  try {
    return await p;
  } finally {
    inflight.delete(videoId);
  }
}

async function runAnalysis(
  repo: SegmentRepository,
  videoId: string,
  channelId: string | null,
  lang: string
): Promise<VideoAnalysis> {
  let status: VideoAnalysis["status"] = "ready";
  let segments: VideoAnalysis["segments"] = [];
  let duration = 0;
  let hash = "nocaptions";
  try {
    const raw = await fetchTimedText(videoId, lang);
    const chunks = parseTimedText(raw as { events?: [] });
    if (chunks.length === 0) throw new Error("empty transcript");
    duration = chunks[chunks.length - 1]!.t1;
    hash = transcriptHash(JSON.stringify(chunks).slice(0, 20000));
    const windows = chunkTranscript(chunks);
    const { candidates, model } = await classifyChunks(windows);
    segments = mergeCandidates(
      candidatesToSegments(
        videoId,
        channelId,
        model === "claude-sonnet" ? "claude-sonnet" : "claude-haiku",
        candidates
      )
    );
  } catch (err) {
    // Fallback: SponsorBlock read-only (FR-07)
    try {
      segments = await fetchSponsorBlock(videoId);
      status = "degraded";
      await repo.logTelemetry(videoId, "fallback_used");
    } catch {
      status = "unanalyzable";
      await repo.logTelemetry(videoId, "no_captions");
    }
    void err;
  }
  const analysis: VideoAnalysis = {
    videoId,
    duration,
    language: lang,
    status,
    segments,
    transcriptVersion: hash,
    analyzedAt: new Date().toISOString(),
  };
  await repo.put(analysis);
  return analysis;
}
