import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  test as base,
  expect,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { FakeApi } from "./fixtures/fake-api";
import {
  ALL_VIDEOS,
  FIXTURE_MEDIA_PATH,
  VIDEO_A,
  fixtureHtml,
  type FixtureOptions,
} from "./fixtures/youtube-fixture";
import { E2E_API_PORT, E2E_EXTENSION_DIR } from "./global-setup";

const MEDIA = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "fixtures/media/blank-150s.webm",
  ),
);

export interface Harness {
  api: FakeApi;
  /** Open a watch page (`/watch?v=<id>`) or any other youtube.com path. */
  open: (videoId: string, opts?: Partial<FixtureOptions>) => Promise<Page>;
  openPath: (path: string, opts?: Partial<FixtureOptions>) => Promise<Page>;
  context: () => BrowserContext;
}

const DEFAULTS: FixtureOptions = {
  variant: "modern",
  staleMs: 1500,
  rowDelayMs: 150,
};

export const test = base.extend<{ h: Harness }>({
  h: async ({}, use) => {
    const api = new FakeApi();
    await api.start(E2E_API_PORT);
    const userDataDir = mkdtempSync(join(tmpdir(), "skipsponsor-e2e-"));
    let ctx: BrowserContext | null = null;
    let opts = DEFAULTS;
    const ensureContext = async (): Promise<BrowserContext> => {
      if (ctx) return ctx;
      ctx = await chromium.launchPersistentContext(userDataDir, {
        channel: "chromium",
        headless: true,
        viewport: { width: 1280, height: 800 },
        args: [
          `--disable-extensions-except=${E2E_EXTENSION_DIR}`,
          `--load-extension=${E2E_EXTENSION_DIR}`,
          "--autoplay-policy=no-user-gesture-required",
        ],
      });
      await ctx.route("https://www.youtube.com/**", (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === FIXTURE_MEDIA_PATH) {
          // Chromium only seeks in media served with byte-range support.
          const range = /bytes=(\d+)-(\d*)/.exec(
            route.request().headers()["range"] ?? "",
          );
          if (!range)
            return route.fulfill({
              contentType: "video/webm",
              headers: { "Accept-Ranges": "bytes" },
              body: MEDIA,
            });
          const start = Number(range[1]);
          const end = range[2] ? Number(range[2]) : MEDIA.length - 1;
          return route.fulfill({
            status: 206,
            contentType: "video/webm",
            headers: {
              "Accept-Ranges": "bytes",
              "Content-Range": `bytes ${start}-${end}/${MEDIA.length}`,
            },
            body: MEDIA.subarray(start, end + 1),
          });
        }
        const v = url.searchParams.get("v");
        return route.fulfill({
          contentType: "text/html",
          body: fixtureHtml(v ?? VIDEO_A.id, ALL_VIDEOS, opts),
        });
      });
      if (ctx.serviceWorkers().length === 0)
        await ctx.waitForEvent("serviceworker");
      return ctx;
    };
    const harness: Harness = {
      api,
      context: () => ctx!,
      openPath: async (path, o = {}) => {
        opts = { ...DEFAULTS, ...o };
        const page = await (await ensureContext()).newPage();
        await page.goto(`https://www.youtube.com${path}`);
        return page;
      },
      open: (videoId, o = {}) => harness.openPath(`/watch?v=${videoId}`, o),
    };
    await use(harness);
    await (ctx as BrowserContext | null)?.close();
    await api.stop();
    rmSync(userDataDir, { recursive: true, force: true });
  },
});

export { expect };

export const tick = (page: Page, t: number): Promise<number> =>
  page.evaluate((x) => window.__fx.tick(x), t);

/** Re-enter `t` until the extension seeks; resolves to the landing time. */
export async function expectSkip(
  page: Page,
  t: number,
  landing: number,
): Promise<void> {
  await expect
    .poll(() => tick(page, t), { timeout: 20_000, intervals: [200] })
    .toBeCloseTo(landing, 1);
}

export async function expectNoSkip(page: Page, t: number): Promise<void> {
  expect(await tick(page, t)).toBeCloseTo(t, 3);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__fx.time())).toBeCloseTo(t, 3);
}

export async function waitForAnalysis(
  api: FakeApi,
  videoId: string,
): Promise<void> {
  await expect
    .poll(() => api.analyzeCalls.filter((c) => c.videoId === videoId).length)
    .toBeGreaterThan(0);
}

export const uploadedText = (api: FakeApi, videoId: string): string =>
  api.analyzeCalls
    .filter((c) => c.videoId === videoId)
    .flatMap((c) => c.transcript.map((x) => x.text))
    .join(" ");

export async function expectPanelRestored(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => window.__fx.panelState().visibility))
    .toBe("ENGAGEMENT_PANEL_VISIBILITY_HIDDEN");
  expect(await page.locator("#skipsponsor-hide-transcript").count()).toBe(0);
}

const worker = (h: Harness) => h.context().serviceWorkers()[0]!;

/** Wait for onInstalled to seed the policy, then merge `patch` into it. */
export async function setPolicy(
  h: Harness,
  patch: Record<string, unknown>,
): Promise<void> {
  const sw = worker(h);
  await expect
    .poll(() =>
      sw.evaluate(async () =>
        Boolean((await chrome.storage.sync.get(["policy"]))["policy"]),
      ),
    )
    .toBe(true);
  await sw.evaluate(async (p) => {
    const s = await chrome.storage.sync.get(["policy"]);
    await chrome.storage.sync.set({ policy: { ...s["policy"], ...p } });
  }, patch);
}

export async function getPolicy(h: Harness): Promise<Record<string, unknown>> {
  return worker(h).evaluate(
    async () => (await chrome.storage.sync.get(["policy"]))["policy"] ?? {},
  );
}

export const extensionId = (h: Harness): string =>
  new URL(worker(h).url()).host;

/** The extension popup, rendered in a tab and pointed at the YouTube tab. */
export async function openPopup(h: Harness): Promise<Page> {
  const tabId = await worker(h).evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "https://www.youtube.com/*" });
    return tab?.id ?? 0;
  });
  const popup = await h.context().newPage();
  await popup.setViewportSize({ width: 340, height: 600 });
  await popup.goto(
    `chrome-extension://${extensionId(h)}/src/extension/popup.html?tab=${tabId}`,
  );
  return popup;
}

export async function openOptions(h: Harness): Promise<Page> {
  const page = await h.context().newPage();
  await page.goto(
    `chrome-extension://${extensionId(h)}/src/extension/options.html`,
  );
  return page;
}

declare global {
  interface Window {
    __fx: {
      tick: (t: number) => number;
      time: () => number;
      navigate: (id: string) => void;
      openTranscript: () => void;
      setAd: (on: boolean) => void;
      seekCalls: number[];
      panelState: () => { visibility: string | null; rows: number };
    };
  }
}
