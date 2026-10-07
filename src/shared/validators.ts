import { z } from "zod";

export const videoIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{11}$/, "Invalid YouTube videoId");

export const segmentCategorySchema = z.enum([
  "sponsor",
  "intro",
  "outro",
  "selfpromo",
  "interaction_reminder",
]);

export const segmentSourceSchema = z.enum([
  "claude-haiku",
  "claude-sonnet",
  "sponsorblock",
  "manual",
]);

export const sponsorSegmentSchema = z.object({
  id: z.string().uuid(),
  videoId: videoIdSchema,
  channelId: z.string().nullable(),
  startTime: z.number().finite().min(0),
  endTime: z.number().finite().positive(),
  confidence: z.number().min(0).max(1),
  category: segmentCategorySchema,
  source: segmentSourceSchema,
  createdAt: z.string().datetime(),
});

export const videoAnalysisSchema = z.object({
  videoId: videoIdSchema,
  duration: z.number().positive(),
  language: z.string().min(2),
  status: z.enum(["ready", "pending", "unanalyzable", "degraded"]),
  segments: z.array(sponsorSegmentSchema),
  transcriptVersion: z.string().min(1),
  analyzedAt: z.string().datetime(),
});

export const userPolicySchema = z.object({
  globalEnabled: z.boolean(),
  mode: z.enum(["auto", "notify", "off"]),
  confidenceThreshold: z.number().min(0.5).max(0.95),
  blockedChannels: z.array(z.string()),
  allowlistedChannels: z.array(z.string()),
});

export const getSegmentsParamsSchema = z.object({ videoId: videoIdSchema });

export const MAX_CUE_TEXT = 600;
export const MAX_TRANSCRIPT_CUES = 5000;

export const transcriptCueSchema = z
  .object({
    t0: z.number().finite().min(0),
    t1: z.number().finite().positive(),
    text: z.string().min(1).max(MAX_CUE_TEXT),
  })
  .refine((c) => c.t1 > c.t0, { message: "t1 must be greater than t0" });

export const analyzeRequestSchema = z.object({
  videoId: videoIdSchema,
  channelId: z.string().min(1).max(64).optional(),
  force: z.boolean().optional().default(false),
  languageHint: z.string().min(2).max(12).optional().default("en"),
  /** Caption cues read from the YouTube page by the extension. */
  transcript: z
    .array(transcriptCueSchema)
    .min(1)
    .max(MAX_TRANSCRIPT_CUES)
    .optional(),
});

export const telemetryRequestSchema = z.object({
  videoId: videoIdSchema,
  eventType: z.enum([
    "skip_executed",
    "skip_undone",
    "fallback_used",
    "llm_error",
    "no_captions",
  ]),
  latencyMs: z.number().int().nonnegative().optional(),
});

export const correctionRequestSchema = z.object({
  startTime: z.number().finite().min(0),
  endTime: z.number().finite().positive(),
  category: segmentCategorySchema,
  action: z.enum(["confirm", "reject"]),
});

export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;
export type TelemetryRequest = z.infer<typeof telemetryRequestSchema>;
