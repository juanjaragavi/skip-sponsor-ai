import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { analyzeRequestSchema } from "../../../shared/validators";
import type { LlmChunk } from "../../../shared/types";

export interface AnalyzeCall {
  videoId: string;
  transcript: LlmChunk[];
  status: number;
}

/**
 * Stand-in for the Fastify API. Requests are validated with the production
 * Zod schema, so payloads the real server would reject (400) fail here too.
 * "Classification" is a deterministic keyword rule standing in for Claude:
 * the sponsor starts at the cue containing "sponsored by" and ends at the
 * next cue containing "back to the video".
 */
export class FakeApi {
  readonly analyzeCalls: AnalyzeCall[] = [];
  readonly telemetry: { videoId: string; eventType: string }[] = [];
  /** Segments the GET (SponsorBlock fallback) path returns per video. */
  readonly fallbackSegments = new Map<string, unknown[]>();
  /** Extra segments appended to the analyze result per video (e.g. low confidence). */
  readonly extraSegments = new Map<string, unknown[]>();
  private server: Server | null = null;

  async start(port: number): Promise<void> {
    this.server = createServer((req, res) => {
      void this.handle(req).then(({ status, body }) => {
        res.writeHead(status, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers":
            "authorization, content-type, x-extension-version",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        });
        res.end(body === undefined ? "" : JSON.stringify(body));
      });
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(port, "127.0.0.1", resolve),
    );
  }

  get port(): number {
    return (this.server!.address() as AddressInfo).port;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  reset(): void {
    this.analyzeCalls.length = 0;
    this.telemetry.length = 0;
  }

  private async handle(
    req: IncomingMessage,
  ): Promise<{ status: number; body?: unknown }> {
    if (req.method === "OPTIONS") return { status: 204 };
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/healthz")
      return { status: 200, body: { ok: true, version: "e2e" } };
    const raw = await readBody(req);
    const get = /^\/v1\/segments\/([A-Za-z0-9_-]{11})$/.exec(url.pathname);
    if (req.method === "GET" && get) {
      return {
        status: 200,
        body: analysis(
          get[1]!,
          "degraded",
          this.fallbackSegments.get(get[1]!) ?? [],
        ),
      };
    }
    if (req.method === "POST" && url.pathname === "/v1/segments:analyze") {
      const parsed = analyzeRequestSchema.safeParse(JSON.parse(raw || "{}"));
      const videoId = (JSON.parse(raw || "{}") as { videoId?: string }).videoId;
      if (!parsed.success) {
        this.analyzeCalls.push({
          videoId: videoId ?? "",
          transcript: [],
          status: 400,
        });
        return { status: 400, body: { title: parsed.error.message } };
      }
      const transcript = parsed.data.transcript ?? [];
      this.analyzeCalls.push({
        videoId: parsed.data.videoId,
        transcript,
        status: 200,
      });
      return {
        status: 200,
        body: analysis(parsed.data.videoId, "ready", [
          ...classify(parsed.data.videoId, transcript),
          ...(this.extraSegments.get(parsed.data.videoId) ?? []),
        ]),
      };
    }
    if (req.method === "POST" && url.pathname === "/v1/telemetry") {
      this.telemetry.push(
        JSON.parse(raw || "{}") as { videoId: string; eventType: string },
      );
      return { status: 202, body: { ok: true } };
    }
    return { status: 404, body: { title: "not found" } };
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c: Buffer) => (data += c.toString("utf8")));
    req.on("end", () => resolve(data));
  });
}

function analysis(
  videoId: string,
  status: string,
  segments: unknown[],
): Record<string, unknown> {
  return {
    videoId,
    status,
    duration: 0,
    language: "en",
    segments,
    analyzedAt: new Date().toISOString(),
  };
}

function classify(videoId: string, cues: LlmChunk[]): unknown[] {
  const start = cues.find((c) => /sponsored by/i.test(c.text));
  if (!start) return [];
  const end = cues.find(
    (c) => c.t0 > start.t0 && /back to the video/i.test(c.text),
  );
  if (!end) return [];
  return [
    {
      id: "11111111-1111-4111-8111-111111111111",
      videoId,
      channelId: null,
      startTime: start.t0,
      endTime: end.t0,
      confidence: 0.95,
      category: "sponsor",
      source: "claude-haiku",
      createdAt: new Date().toISOString(),
    },
  ];
}
