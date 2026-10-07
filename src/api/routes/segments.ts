import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import {
  getSegmentsParamsSchema,
  analyzeRequestSchema,
  correctionRequestSchema,
  videoIdSchema,
} from "../../shared/validators";
import type { LlmChunk, VideoAnalysis } from "../../shared/types";
import type { SegmentRepository } from "../repositories/segment-repository";
import { fetchTimedText } from "../services/transcript-fetcher";
import {
  parseTimedText,
  chunkTranscript,
  transcriptHash,
} from "../services/chunker";
import { classifyChunks } from "../services/llm-client";
import {
  candidatesToSegments,
  mergeCandidates,
} from "../services/segment-classifier";
import { fetchSponsorBlock } from "../services/sponsorblock";
import {
  corroborateSegments,
  findCaptionGaps,
  segmentsOverlap,
} from "../services/gap-corroboration";
import { CORROBORATED_CONFIDENCE } from "../../shared/constants";

const inflight = new Map<string, Promise<VideoAnalysis>>();

export function registerSegmentRoutes(
  app: FastifyInstance,
  repo: SegmentRepository,
): void {
  app.get("/v1/segments/:videoId", async (req, reply) => {
    const params = getSegmentsParamsSchema.parse(req.params);
    const cached = await repo.get(params.videoId);
    if (cached) return reply.send(toResponse(cached));
    const analysis = await analyzeVideo(
      repo,
      req.log,
      params.videoId,
      null,
      "en",
      false,
    );
    return reply.send(toResponse(analysis));
  });

  app.post("/v1/segments:analyze", async (req, reply) => {
    const body = analyzeRequestSchema.parse(req.body);
    if (!body.force) {
      const cached = await repo.get(body.videoId);
      // A client transcript supersedes degraded/unanalyzable results only.
      const usable = body.transcript ? cached?.status === "ready" : cached;
      if (cached && usable) return reply.code(200).send(toResponse(cached));
    }
    const analysis = await analyzeVideo(
      repo,
      req.log,
      body.videoId,
      body.channelId ?? null,
      body.languageHint ?? "en",
      body.force || Boolean(body.transcript),
      body.transcript,
    );
    return reply.send(toResponse(analysis));
  });

  app.post("/v1/segments/:videoId/corrections", async (req, reply) => {
    const { videoId } = zParams(req.params);
    const body = correctionRequestSchema.parse(req.body);
    const existing = await repo.get(videoId);
    if (!existing)
      return reply.code(404).send(problem(404, "Not found", videoId));
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
    if (!existing)
      return reply.code(404).send(problem(404, "Not found", videoId));
    await repo.put({ ...existing, segments: [], status: "unanalyzable" });
    return reply.code(204).send();
  });
}

function zParams(params: unknown): { videoId: string } {
  return {
    videoId: videoIdSchema.parse((params as { videoId: string }).videoId),
  };
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
  log: FastifyBaseLogger,
  videoId: string,
  channelId: string | null,
  lang: string,
  force: boolean,
  transcript?: LlmChunk[],
): Promise<VideoAnalysis> {
  if (!force) {
    const cached = await repo.get(videoId);
    if (cached) return cached;
  }
  if (inflight.has(videoId)) return inflight.get(videoId)!;
  const p = runAnalysis(repo, log, videoId, channelId, lang, transcript);
  inflight.set(videoId, p);
  try {
    return await p;
  } finally {
    inflight.delete(videoId);
  }
}

/**
 * Add SponsorBlock sponsors that fall inside caption gaps (where Claude had
 * nothing to read) and are not already covered. Never fails the analysis.
 */
async function addGapCorroborated(
  log: FastifyBaseLogger,
  videoId: string,
  chunks: LlmChunk[],
  existing: VideoAnalysis["segments"],
): Promise<VideoAnalysis["segments"]> {
  const gaps = findCaptionGaps(chunks);
  if (gaps.length === 0) return existing;
  try {
    const extra = corroborateSegments(
      await fetchSponsorBlock(videoId),
      gaps,
    ).filter(
      (s) =>
        s.confidence >= CORROBORATED_CONFIDENCE &&
        !existing.some((e) => segmentsOverlap(e, s)),
    );
    return [...existing, ...extra].sort((a, b) => a.startTime - b.startTime);
  } catch (err) {
    log.debug({ err, videoId }, "gap corroboration skipped");
    return existing;
  }
}

async function runAnalysis(
  repo: SegmentRepository,
  log: FastifyBaseLogger,
  videoId: string,
  channelId: string | null,
  lang: string,
  transcript?: LlmChunk[],
): Promise<VideoAnalysis> {
  let status: VideoAnalysis["status"] = "ready";
  let segments: VideoAnalysis["segments"] = [];
  let duration = 0;
  let hash = "nocaptions";
  let chunks: LlmChunk[] = [];
  try {
    chunks =
      transcript ??
      parseTimedText((await fetchTimedText(videoId, lang)) as { events?: [] });
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
        candidates,
      ),
    );
    segments = await addGapCorroborated(log, videoId, chunks, segments);
  } catch (err) {
    log.warn(
      { err, videoId, clientTranscript: Boolean(transcript) },
      "analysis failed; falling back to SponsorBlock",
    );
    // Fallback: SponsorBlock read-only (FR-07)
    try {
      segments = corroborateSegments(
        await fetchSponsorBlock(videoId),
        findCaptionGaps(chunks),
      );
      status = "degraded";
      await repo.logTelemetry(videoId, "fallback_used");
    } catch {
      status = "unanalyzable";
      await repo.logTelemetry(videoId, "no_captions");
    }
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
