import { describe, expect, it, vi } from "vitest";
import { buildServer } from "../../api/server";
import { memoryPersistence } from "../../api/persistence";

function serverWithSpy() {
  const persistence = memoryPersistence();
  const logTelemetry = vi.spyOn(persistence.repo, "logTelemetry");
  return { app: buildServer({ persistence }), logTelemetry };
}

describe("POST /v1/telemetry", () => {
  it("stores the event and answers 204 with no body", async () => {
    const { app, logTelemetry } = serverWithSpy();
    const res = await app.inject({
      method: "POST",
      url: "/v1/telemetry",
      payload: {
        videoId: "dQw4w9WgXcQ",
        eventType: "skip_executed",
        latencyMs: 180,
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
    expect(logTelemetry).toHaveBeenCalledWith(
      "dQw4w9WgXcQ",
      "skip_executed",
      180,
    );
    await app.close();
  });

  it("accepts an event without a latency", async () => {
    const { app, logTelemetry } = serverWithSpy();
    const res = await app.inject({
      method: "POST",
      url: "/v1/telemetry",
      payload: { videoId: "dQw4w9WgXcQ", eventType: "no_captions" },
    });
    expect(res.statusCode).toBe(204);
    expect(logTelemetry).toHaveBeenCalledWith(
      "dQw4w9WgXcQ",
      "no_captions",
      undefined,
    );
    await app.close();
  });

  it.each([
    ["an unknown event type", { videoId: "dQw4w9WgXcQ", eventType: "clicked" }],
    ["a malformed video id", { videoId: "../etc", eventType: "skip_executed" }],
    [
      "a negative latency",
      { videoId: "dQw4w9WgXcQ", eventType: "skip_executed", latencyMs: -1 },
    ],
  ])(
    "rejects %s with an RFC 7807 problem and stores nothing",
    async (_n, payload) => {
      const { app, logTelemetry } = serverWithSpy();
      const res = await app.inject({
        method: "POST",
        url: "/v1/telemetry",
        payload,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({
        status: 400,
        instance: "/v1/telemetry",
        type: expect.stringMatching(/\/problems\/400$/),
      });
      expect(logTelemetry).not.toHaveBeenCalled();
      await app.close();
    },
  );

  it("hides storage failures behind a generic 500", async () => {
    const { app, logTelemetry } = serverWithSpy();
    logTelemetry.mockRejectedValueOnce(
      new Error("connect ECONNREFUSED 10.0.0.12:5432"),
    );
    const res = await app.inject({
      method: "POST",
      url: "/v1/telemetry",
      payload: { videoId: "dQw4w9WgXcQ", eventType: "skip_undone" },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().detail).toBe("Internal Server Error");
    expect(res.body).not.toContain("10.0.0.12");
    await app.close();
  });
});
