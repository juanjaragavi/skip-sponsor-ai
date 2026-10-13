import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
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
  dedupeOverlapping,
  mergeCandidates,
} from "../services/segment-classifier";
import { fetchSponsorBlock } from "../services/sponsorblock";
import {
  corroborateSegments,
  findCaptionGaps,
  segmentsOverlap,
} from "../services/gap-corroboration";
import {
  CORROBORATED_CONFIDENCE,
  FALLBACK_REFRESH_SECONDS,
} from "../../shared/constants";
import type { Allowance, LimitReason } from "../services/cost-guard";
import { ADMIN_TOKEN_HEADER, adminTokenMatches } from "../services/admin-token";

/** Meters fresh LLM analyses (cost-guard.ts). Cache hits never reach it. */
export interface AnalysisGate {
  reserve(req: FastifyRequest): Promise<Allowance>;
}
type Reserve = () => Promise<Allowance>;
const ALLOW: Reserve = async () => ({ ok: true });
const OPEN_GATE: AnalysisGate = { reserve: ALLOW };

const LIMIT_TITLES: Record<LimitReason, string> = {
  llm_not_configured: "AI analysis is not configured",
  install_quota: "Daily analysis limit reached",
  global_budget: "Analysis capacity reached for today",
  llm_disabled: "AI analysis is paused",
  unauthenticated: "Missing or invalid install token",
};
const LIMIT_STATUS: Record<LimitReason, number> = {
  llm_not_configured: 503,
  install_quota: 429,
  global_budget: 429,
  llm_disabled: 503,
  unauthenticated: 401,
};

/** RFC7807 problem for a refused analysis; `reason` and `resetAt` drive the extension's notice. */
function sendLimited(
  req: FastifyRequest,
  reply: FastifyReply,
  a: Extract<Allowance, { ok: false }>,
): FastifyReply {
  const status = LIMIT_STATUS[a.reason];
  if (status !== 401) {
    const seconds = Math.ceil((Date.parse(a.resetAt) - Date.now()) / 1000);
    void reply.header("retry-after", String(Math.max(1, seconds)));
  }
  const detail =
    a.reason === "llm_not_configured"
      ? "This server has no AI provider key configured, so it cannot analyze new videos. Cached results keep working."
      : `${LIMIT_TITLES[a.reason]}. Cached results keep working; new analyses resume at ${a.resetAt}.`;
  return reply.code(status).send({
    type: `https://api.skipsponsor.example.com/problems/${a.reason}`,
    title: LIMIT_TITLES[a.reason],
    status,
    detail,
    instance: req.url,
    reason: a.reason,
    resetAt: a.resetAt,
  });
}

const inflight = new Map<string, Promise<VideoAnalysis>>();
const WHOLE_VIDEO = { start: 0, end: Number.POSITIVE_INFINITY };

/**
 * A SponsorBlock-only result old enough that new community labels may exist.
 * "unanalyzable" is not refreshed: DELETE /v1/segments/:id leaves that status
 * as a tombstone.
 */
function isStaleFallback(a: VideoAnalysis): boolean {
  if (a.status !== "degraded") return false;
  const age = Date.now() - Date.parse(a.analyzedAt);
  return !(age < FALLBACK_REFRESH_SECONDS * 1000);
}

/**
 * A cached result that must be computed again before it is served. With
 * SponsorBlock off, a "degraded" result is SponsorBlock data (stored while the
 * fallback was on): it is replaced by an honest "unanalyzable", never served.
 */
function needsRefresh(a: VideoAnalysis, sponsorBlock: boolean): boolean {
  return sponsorBlock ? isStaleFallback(a) : a.status === "degraded";
}

/** Options of the segment routes. */
export interface SegmentRouteOptions {
  /** SPONSORBLOCK_ENABLED: fetch and serve SponsorBlock data. Default off. */
  sponsorBlockEnabled?: boolean;
}

/**
 * Operator-only routes (security audit 2026-10-12): 404 while no
 * ADMIN_API_TOKEN is configured, 401 without the right `x-admin-token`.
 * Returns the refusal already sent, or null when the caller is the operator.
 */
function refuseUnlessAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
  adminToken: string,
): FastifyReply | null {
  if (adminToken.length === 0)
    return reply.code(404).send(problem(404, "Not found", req.url));
  if (adminTokenMatches(adminToken, req.headers[ADMIN_TOKEN_HEADER]))
    return null;
  return reply.code(401).send(problem(401, "Admin token required", req.url));
}

export function registerSegmentRoutes(
  app: FastifyInstance,
  repo: SegmentRepository,
  gate: AnalysisGate = OPEN_GATE,
  adminToken = "",
  options: SegmentRouteOptions = {},
): void {
  const sb = options.sponsorBlockEnabled ?? false;
  const respond = (a: VideoAnalysis) => toResponse(a, sb);
  app.get("/v1/segments/:videoId", async (req, reply) => {
    const params = getSegmentsParamsSchema.parse(req.params);
    const cached = await repo.get(params.videoId);
    if (cached && !needsRefresh(cached, sb)) return reply.send(respond(cached));
    // Metered lazily, only once a transcript exists and the LLM would run.
    // Without one: SponsorBlock data (degraded) when enabled, otherwise an
    // honest "unanalyzable".
    const analysis = await analyzeVideo(
      repo,
      req.log,
      params.videoId,
      null,
      "en",
      Boolean(cached),
      sb,
      undefined,
      () => gate.reserve(req),
    );
    return reply.send(respond(analysis));
  });

  app.post("/v1/segments:analyze", async (req, reply) => {
    const body = analyzeRequestSchema.parse(req.body);
    // `force` replaces a ready shared result for every install: operator only.
    if (
      body.force &&
      !adminTokenMatches(adminToken, req.headers[ADMIN_TOKEN_HEADER])
    )
      return reply
        .code(403)
        .send(problem(403, "force requires the admin token", req.url));
    let replaceCached = false;
    if (!body.force) {
      const cached = await repo.get(body.videoId);
      // A client transcript supersedes degraded/unanalyzable results only.
      const usable = body.transcript
        ? cached?.status === "ready"
        : cached && !needsRefresh(cached, sb);
      if (cached && usable) return reply.code(200).send(respond(cached));
      replaceCached = Boolean(cached);
    }
    // Joining an analysis already in flight costs nothing extra.
    if (!inflight.has(body.videoId)) {
      const allowance = await gate.reserve(req);
      if (!allowance.ok) return sendLimited(req, reply, allowance);
    }
    const analysis = await analyzeVideo(
      repo,
      req.log,
      body.videoId,
      body.channelId ?? null,
      body.languageHint ?? "en",
      body.force || Boolean(body.transcript) || replaceCached,
      sb,
      body.transcript,
    );
    return reply.send(respond(analysis));
  });

  app.post("/v1/segments/:videoId/corrections", async (req, reply) => {
    const refused = refuseUnlessAdmin(req, reply, adminToken);
    if (refused) return refused;
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
    const refused = refuseUnlessAdmin(req, reply, adminToken);
    if (refused) return refused;
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

/** With SponsorBlock off, SponsorBlock segments stored earlier are never served. */
function toResponse(a: VideoAnalysis, sponsorBlock: boolean): unknown {
  return {
    videoId: a.videoId,
    status: a.status,
    duration: a.duration,
    language: a.language,
    segments: sponsorBlock
      ? a.segments
      : a.segments.filter((s) => s.source !== "sponsorblock"),
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
  sponsorBlock: boolean,
  transcript?: LlmChunk[],
  reserve: Reserve = ALLOW,
): Promise<VideoAnalysis> {
  if (!force) {
    const cached = await repo.get(videoId);
    if (cached) return cached;
  }
  if (inflight.has(videoId)) return inflight.get(videoId)!;
  const p = runAnalysis(
    repo,
    log,
    videoId,
    channelId,
    lang,
    transcript,
    reserve,
    sponsorBlock,
  );
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
    return dedupeOverlapping([...existing, ...extra]);
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
  transcript: LlmChunk[] | undefined,
  reserve: Reserve,
  sponsorBlock: boolean,
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
    const allowance = await reserve();
    if (!allowance.ok) throw new Error(`LLM skipped: ${allowance.reason}`);
    const { candidates, model } = await classifyChunks(windows);
    segments = mergeCandidates(
      candidatesToSegments(
        videoId,
        channelId,
        model === "claude-sonnet" ? "claude-sonnet" : "claude-haiku",
        candidates,
      ),
    );
    if (sponsorBlock)
      segments = await addGapCorroborated(log, videoId, chunks, segments);
  } catch (err) {
    log.warn(
      { err, videoId, clientTranscript: Boolean(transcript) },
      sponsorBlock
        ? "analysis failed; falling back to SponsorBlock"
        : "analysis failed; not analyzed (SponsorBlock off)",
    );
    segments = [];
    status = "unanalyzable";
    // No silent fallback while SponsorBlock is off: the result says the video
    // was not analyzed, and the extension tells the viewer so.
    // Fallback: SponsorBlock read-only (FR-07), only when enabled. Without
    // any transcript the captions cover nothing, so the whole video is one
    // caption gap and the community labels are the only evidence. With a
    // transcript (LLM failure) only labels inside real caption gaps are
    // trusted.
    if (sponsorBlock) {
      try {
        const gaps =
          chunks.length > 0 ? findCaptionGaps(chunks) : [WHOLE_VIDEO];
        segments = dedupeOverlapping(
          corroborateSegments(await fetchSponsorBlock(videoId), gaps),
        );
        status = "degraded";
      } catch {
        // no SponsorBlock data either: unanalyzable
      }
    }
    await repo.logTelemetry(
      videoId,
      status === "degraded" ? "fallback_used" : "no_captions",
    );
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
