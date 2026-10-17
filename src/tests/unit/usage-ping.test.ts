import { describe, expect, it, vi } from "vitest";
import {
  LAST_ACTIVE_KEY,
  USAGE_ID_KEY,
  onInstalledUsage,
  pingActiveOncePerDay,
  sendUsage,
  syncUninstallUrl,
  uninstallUrl,
  usageId,
  type UsageDeps,
} from "../../extension/usage-ping";

const ID = "2f1c6a8e-4b3d-4e5f-9a7b-1c2d3e4f5a6b";
const ORIGIN = "https://api.example.test";

function deps(
  opts: {
    enabled?: boolean;
    status?: number;
    local?: Record<string, unknown>;
    now?: string;
    fetchError?: boolean;
  } = {},
) {
  const local: Record<string, unknown> = { ...(opts.local ?? {}) };
  const sync: Record<string, unknown> =
    opts.enabled === false ? { telemetryEnabled: false } : {};
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    if (opts.fetchError) throw new TypeError("Failed to fetch");
    return new Response(null, { status: opts.status ?? 204 });
  });
  const setUninstallURL = vi.fn(async (_url: string) => undefined);
  const d: UsageDeps = {
    local: {
      get: async (keys) =>
        Object.fromEntries(
          keys.filter((k) => k in local).map((k) => [k, local[k]]),
        ),
      set: async (items) => void Object.assign(local, items),
    },
    sync: {
      get: async (keys) =>
        Object.fromEntries(
          keys.filter((k) => k in sync).map((k) => [k, sync[k]]),
        ),
    },
    fetch: fetchMock as unknown as typeof fetch,
    setUninstallURL,
    apiOrigin: ORIGIN,
    version: "1.1.0",
    now: () => new Date(opts.now ?? "2026-10-17T15:00:00Z"),
    randomId: () => ID,
  };
  return { d, local, fetchMock, setUninstallURL };
}

const bodyOf = (call: unknown[]) =>
  JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;

describe("usage id", () => {
  it("is created once and reused", async () => {
    const { d, local } = deps();
    expect(await usageId(d)).toBe(ID);
    expect(local[USAGE_ID_KEY]).toBe(ID);
    const other = deps({
      local: { [USAGE_ID_KEY]: "7d1e2f3a-4b5c-4d6e-8f70-819203a4b5c6" },
    });
    expect(await usageId(other.d)).toBe("7d1e2f3a-4b5c-4d6e-8f70-819203a4b5c6");
  });

  it("replaces a corrupt stored value", async () => {
    const { d, local } = deps({ local: { [USAGE_ID_KEY]: "not-a-uuid" } });
    expect(await usageId(d)).toBe(ID);
    expect(local[USAGE_ID_KEY]).toBe(ID);
  });
});

describe("sendUsage", () => {
  it("posts only the random id, the event and the version, without credentials", async () => {
    const { d, fetchMock } = deps();
    expect(await sendUsage(d, "install")).toBe(true);
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe(`${ORIGIN}/v1/usage`);
    const init = call[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("omit");
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization/i);
    expect(bodyOf(call)).toEqual({
      id: ID,
      event: "install",
      version: "1.1.0",
    });
  });

  it("sends nothing when usage statistics are off", async () => {
    const { d, fetchMock } = deps({ enabled: false });
    expect(await sendUsage(d, "install")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is best effort when offline or refused", async () => {
    expect(await sendUsage(deps({ fetchError: true }).d, "active")).toBe(false);
    expect(await sendUsage(deps({ status: 404 }).d, "active")).toBe(false);
  });
});

describe("pingActiveOncePerDay", () => {
  it("pings once per UTC day and remembers the day", async () => {
    const { d, fetchMock, local } = deps();
    expect(await pingActiveOncePerDay(d)).toBe(true);
    expect(await pingActiveOncePerDay(d)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetchMock.mock.calls[0]!).event).toBe("active");
    expect(local[LAST_ACTIVE_KEY]).toBe("2026-10-17");
  });

  it("pings again on the next UTC day", async () => {
    const { d, fetchMock } = deps({
      local: { [LAST_ACTIVE_KEY]: "2026-10-16" },
      now: "2026-10-17T00:00:01Z",
    });
    expect(await pingActiveOncePerDay(d)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on the next video when the ping failed", async () => {
    const { d, local } = deps({ status: 503 });
    expect(await pingActiveOncePerDay(d)).toBe(false);
    expect(local[LAST_ACTIVE_KEY]).toBeUndefined();
  });

  it("does nothing while opted out", async () => {
    const { d, fetchMock, local } = deps({ enabled: false });
    expect(await pingActiveOncePerDay(d)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(local[USAGE_ID_KEY]).toBeUndefined();
  });
});

describe("uninstall page", () => {
  it("points at the counter with the id and version", async () => {
    const { d, setUninstallURL } = deps();
    await syncUninstallUrl(d);
    expect(setUninstallURL).toHaveBeenCalledWith(
      `${ORIGIN}/v1/usage/uninstalled?id=${ID}&v=1.1.0`,
    );
    expect(uninstallUrl(ORIGIN, ID, "1.1.0").length).toBeLessThan(1023);
  });

  it("is cleared when usage statistics are off", async () => {
    const { d, setUninstallURL } = deps({ enabled: false });
    await syncUninstallUrl(d);
    expect(setUninstallURL).toHaveBeenCalledWith("");
  });

  it("never throws from the service worker", async () => {
    const { d } = deps();
    d.setUninstallURL = () => {
      throw new Error("Invalid URL");
    };
    await expect(syncUninstallUrl(d)).resolves.toBeUndefined();
  });
});

describe("onInstalledUsage", () => {
  it("counts a new install and sets the uninstall page", async () => {
    const { d, fetchMock, setUninstallURL } = deps();
    await onInstalledUsage(d, { reason: "install" });
    expect(bodyOf(fetchMock.mock.calls[0]!).event).toBe("install");
    expect(setUninstallURL).toHaveBeenCalledTimes(1);
  });

  it("counts an update only when the version changed", async () => {
    const a = deps();
    await onInstalledUsage(a.d, { reason: "update", previousVersion: "1.0.0" });
    expect(bodyOf(a.fetchMock.mock.calls[0]!).event).toBe("update");
    const b = deps();
    await onInstalledUsage(b.d, { reason: "update", previousVersion: "1.1.0" });
    expect(b.fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing for other reasons (e.g. a Chrome update)", async () => {
    const { d, fetchMock } = deps();
    await onInstalledUsage(d, { reason: "chrome_update" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing at install when opted out (synced setting)", async () => {
    const { d, fetchMock, setUninstallURL } = deps({ enabled: false });
    await onInstalledUsage(d, { reason: "install" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(setUninstallURL).toHaveBeenCalledWith("");
  });
});
