import { describe, expect, it, vi } from "vitest";
import { buildServer } from "../../api/server";
import { memoryPersistence } from "../../api/persistence";
import { MemoryUsageStatsStore } from "../../api/repositories/usage-stats";
import { uninstallPage } from "../../api/routes/usage";

const ID = "2f1c6a8e-4b3d-4e5f-9a7b-1c2d3e4f5a6b";
const ADMIN = "a".repeat(40);
const SECRET = "s".repeat(40);

function server(store = new MemoryUsageStatsStore(), adminToken = ADMIN) {
  const app = buildServer({
    persistence: memoryPersistence(),
    usageStats: store,
    adminToken,
    installTokenSecret: SECRET,
  });
  return { app, store };
}

describe("POST /v1/usage", () => {
  it("stores a keyed hash of the id with the day, event and version only", async () => {
    const { app, store } = server();
    const res = await app.inject({
      method: "POST",
      url: "/v1/usage",
      payload: { id: ID, event: "install", version: "1.1.0" },
    });
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
    expect(store.rows).toHaveLength(1);
    const row = store.rows[0]!;
    expect(row.event).toBe("install");
    expect(row.version).toBe("1.1.0");
    expect(row.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(row.key).toMatch(/^u:[A-Za-z0-9_-]{32}$/);
    expect(row.key).not.toContain(ID);
    expect(Object.keys(row).sort()).toEqual(["day", "event", "key", "version"]);
    await app.close();
  });

  it("drops anything else the body carries (no video, URL or channel is kept)", async () => {
    const { app, store } = server();
    const res = await app.inject({
      method: "POST",
      url: "/v1/usage",
      payload: {
        id: ID,
        event: "active",
        version: "1.1.0",
        videoId: "dQw4w9WgXcQ",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      },
    });
    expect(res.statusCode).toBe(204);
    expect(JSON.stringify(store.rows)).not.toMatch(/dQw4w9WgXcQ|youtube/);
    await app.close();
  });

  it("counts one event per id per day", async () => {
    const { app, store } = server();
    for (let i = 0; i < 3; i++)
      await app.inject({
        method: "POST",
        url: "/v1/usage",
        payload: { id: ID, event: "active", version: "1.1.0" },
      });
    expect(store.rows).toHaveLength(1);
    await app.close();
  });

  it.each([
    ["a non-UUID id", { id: "abc", event: "install", version: "1.1.0" }],
    ["an unknown event", { id: ID, event: "click", version: "1.1.0" }],
    [
      "an uninstall event (only the uninstall page counts those)",
      { id: ID, event: "uninstall", version: "1.1.0" },
    ],
    ["a malformed version", { id: ID, event: "install", version: "<script>" }],
    ["no id", { event: "install", version: "1.1.0" }],
  ])("rejects %s with 400", async (_label, payload) => {
    const { app, store } = server();
    const res = await app.inject({ method: "POST", url: "/v1/usage", payload });
    expect(res.statusCode).toBe(400);
    expect(store.rows).toHaveLength(0);
    await app.close();
  });

  it("answers 204 even when the store fails (best effort, e.g. migration not applied)", async () => {
    const store = new MemoryUsageStatsStore();
    vi.spyOn(store, "record").mockRejectedValue(
      new Error('relation "usage_pings" does not exist'),
    );
    const { app } = server(store);
    const res = await app.inject({
      method: "POST",
      url: "/v1/usage",
      payload: { id: ID, event: "install", version: "1.1.0" },
    });
    expect(res.statusCode).toBe(204);
    await app.close();
  });
});

describe("GET /v1/usage/uninstalled", () => {
  it("counts the uninstall and serves a static thank-you page", async () => {
    const { app, store } = server();
    const res = await app.inject({
      method: "GET",
      url: `/v1/usage/uninstalled?id=${ID}&v=1.1.0`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.headers["content-security-policy"]).toContain(
      "default-src 'none'",
    );
    expect(res.body).toContain("SkipSponsor AI was removed");
    expect(res.body).toContain("info@devspeak.dev");
    expect(res.body).not.toMatch(/<script/i);
    expect(store.rows).toEqual([
      expect.objectContaining({ event: "uninstall", version: "1.1.0" }),
    ]);
    await app.close();
  });

  it("serves the page without counting when the id is missing or invalid", async () => {
    const { app, store } = server();
    for (const url of [
      "/v1/usage/uninstalled",
      "/v1/usage/uninstalled?id=nope&v=1.1.0",
    ]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(200);
    }
    expect(store.rows).toHaveLength(0);
    await app.close();
  });

  it("escapes the contact address it renders", () => {
    expect(uninstallPage('a"<b>@x.dev')).not.toContain('a"<b>');
  });
});

describe("GET /v1/usage/summary", () => {
  it("is 404 while no admin token is configured", async () => {
    const { app } = server(new MemoryUsageStatsStore(), "");
    const res = await app.inject({ method: "GET", url: "/v1/usage/summary" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("is 401 without the right x-admin-token", async () => {
    const { app } = server();
    const res = await app.inject({
      method: "GET",
      url: "/v1/usage/summary",
      headers: { "x-admin-token": "wrong" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns aggregate counts for the operator", async () => {
    const { app } = server();
    const other = "7d1e2f3a-4b5c-4d6e-8f70-819203a4b5c6";
    for (const [id, event] of [
      [ID, "install"],
      [ID, "active"],
      [other, "active"],
    ] as const)
      await app.inject({
        method: "POST",
        url: "/v1/usage",
        payload: { id, event, version: "1.1.0" },
      });
    const res = await app.inject({
      method: "GET",
      url: "/v1/usage/summary",
      headers: { "x-admin-token": ADMIN },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.installs.total).toBe(1);
    expect(body.dailyActive).toBe(2);
    expect(body.weeklyActive).toBe(2);
    expect(body.weeklyActiveByVersion).toEqual({ "1.1.0": 2 });
    expect(JSON.stringify(body)).not.toContain(ID);
    await app.close();
  });

  it("rejects a malformed asOf day", async () => {
    const { app } = server();
    const res = await app.inject({
      method: "GET",
      url: "/v1/usage/summary?asOf=yesterday",
      headers: { "x-admin-token": ADMIN },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
