import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  VIDEO_A,
  VIDEO_B,
  VIDEO_LONG,
  VIDEO_NO_CAPTIONS,
  fixtureHtml,
  type FixtureOptions,
} from "./fixtures/youtube-fixture";
import { E2E_API_PORT, E2E_EXTENSION_DIR } from "./global-setup";

interface Harness {
  api: FakeApi;
  open: (videoId: string, opts?: Partial<FixtureOptions>) => Promise<Page>;
  context: () => BrowserContext;
}

const DEFAULTS: FixtureOptions = {
  variant: "modern",
  staleMs: 1500,
  rowDelayMs: 150,
};

const test = base.extend<{ h: Harness }>({
  h: async ({}, use) => {
    const api = new FakeApi();
    await api.start(E2E_API_PORT);
    const userDataDir = mkdtempSync(join(tmpdir(), "skipsponsor-e2e-"));
    let ctx: BrowserContext | null = null;
    let opts = DEFAULTS;
    const harness: Harness = {
      api,
      context: () => ctx!,
      open: async (videoId, o = {}) => {
        opts = { ...DEFAULTS, ...o };
        if (!ctx) {
          ctx = await chromium.launchPersistentContext(userDataDir, {
            channel: "chromium",
            headless: true,
            args: [
              `--disable-extensions-except=${E2E_EXTENSION_DIR}`,
              `--load-extension=${E2E_EXTENSION_DIR}`,
            ],
          });
          await ctx.route("https://www.youtube.com/**", (route) => {
            const v = new URL(route.request().url()).searchParams.get("v");
            return route.fulfill({
              contentType: "text/html",
              body: fixtureHtml(v ?? VIDEO_A.id, ALL_VIDEOS, opts),
            });
          });
          if (ctx.serviceWorkers().length === 0)
            await ctx.waitForEvent("serviceworker");
        }
        const page = await ctx.newPage();
        await page.goto(`https://www.youtube.com/watch?v=${videoId}`);
        return page;
      },
    };
    await use(harness);
    await (ctx as BrowserContext | null)?.close();
    await api.stop();
    rmSync(userDataDir, { recursive: true, force: true });
  },
});

const tick = (page: Page, t: number): Promise<number> =>
  page.evaluate((x) => window.__fx.tick(x), t);

/** Re-enter `t` until the extension seeks; resolves to the landing time. */
async function expectSkip(
  page: Page,
  t: number,
  landing: number,
): Promise<void> {
  await expect
    .poll(() => tick(page, t), { timeout: 20_000, intervals: [200] })
    .toBeCloseTo(landing, 1);
}

async function expectNoSkip(page: Page, t: number): Promise<void> {
  expect(await tick(page, t)).toBeCloseTo(t, 3);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__fx.time())).toBeCloseTo(t, 3);
}

async function waitForAnalysis(api: FakeApi, videoId: string): Promise<void> {
  await expect
    .poll(() => api.analyzeCalls.filter((c) => c.videoId === videoId).length)
    .toBeGreaterThan(0);
}

const uploadedText = (api: FakeApi, videoId: string): string =>
  api.analyzeCalls
    .filter((c) => c.videoId === videoId)
    .flatMap((c) => c.transcript.map((x) => x.text))
    .join(" ");

async function expectPanelRestored(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => window.__fx.panelState().visibility))
    .toBe("ENGAGEMENT_PANEL_VISIBILITY_HIDDEN");
  expect(await page.locator("#skipsponsor-hide-transcript").count()).toBe(0);
}

for (const variant of ["legacy", "modern", "inThisVideo"] as const) {
  test(`skips the sponsor read with the ${variant} transcript panel`, async ({
    h,
  }) => {
    const page = await h.open(VIDEO_A.id, { variant });
    await expectSkip(page, 31, 60.25);
    expect(uploadedText(h.api, VIDEO_A.id)).toContain("AcmeVPN");
    await expectPanelRestored(page);
  });
}

test("does not skip outside the sponsor read (intro and content play)", async ({
  h,
}) => {
  const page = await h.open(VIDEO_A.id);
  await expectSkip(page, 31, 60.25);
  await expectNoSkip(page, 2); // intro animation
  await expectNoSkip(page, 20); // content before the read
  await expectNoSkip(page, 65); // content after the read
});

for (const panelLeftOpen of [false, true]) {
  test(`SPA navigation analyzes the new video, not stale rows (panel ${
    panelLeftOpen ? "left open" : "closed"
  })`, async ({ h }) => {
    const page = await h.open(VIDEO_A.id);
    await expectSkip(page, 31, 60.25);
    if (panelLeftOpen) await page.evaluate(() => window.__fx.openTranscript());

    await page.evaluate((id) => window.__fx.navigate(id), VIDEO_B.id);
    await waitForAnalysis(h.api, VIDEO_B.id);

    const text = uploadedText(h.api, VIDEO_B.id);
    expect(text).toContain("BetaBank");
    expect(text).not.toContain("AcmeVPN");
    await expectSkip(page, 81, 100.25);
    // Video A's sponsor window (30-60s) is ordinary content in video B.
    await expectNoSkip(page, 31);
  });
}

test("ignores the timeline while a YouTube ad is playing", async ({ h }) => {
  const page = await h.open(VIDEO_A.id);
  await waitForAnalysis(h.api, VIDEO_A.id);
  await page.waitForTimeout(1000);

  await page.evaluate(() => window.__fx.setAd(true));
  await expectNoSkip(page, 31);
  expect(await page.locator("#skipsponsor-toast-host").count()).toBe(0);

  await page.evaluate(() => window.__fx.setAd(false));
  await expectSkip(page, 31, 60.25);
});

test("toast stays isolated, undo rewinds and suppresses the re-skip", async ({
  h,
}) => {
  const page = await h.open(VIDEO_A.id);
  await expectSkip(page, 31, 60.25);

  // Toast nodes and its stylesheet must live inside the shadow root only.
  const leaked = await page.evaluate(
    () =>
      document.querySelectorAll("html > style, html > .wrap, body > .wrap")
        .length,
  );
  expect(leaked).toBe(0);
  const undo = page
    .locator("#skipsponsor-toast-host")
    .locator("button.undo")
    .first();
  await expect(undo).toBeVisible();

  await undo.click();
  expect(await page.evaluate(() => window.__fx.time())).toBeCloseTo(29, 3);
  await expectNoSkip(page, 31);

  await page.waitForTimeout(4500);
  expect(await page.locator("#skipsponsor-toast-host").count()).toBe(0);
  expect(
    await page.evaluate(() => document.querySelectorAll(".wrap").length),
  ).toBe(0);
});

test("blocklist uses the channel of the video being analyzed after SPA navigation", async ({
  h,
}) => {
  const page = await h.open(VIDEO_A.id);
  const sw = h.context().serviceWorkers()[0]!;
  // Wait for onInstalled to seed the default policy, otherwise it can
  // overwrite the write below.
  await expect
    .poll(() =>
      sw.evaluate(async () =>
        Boolean((await chrome.storage.sync.get(["policy"]))["policy"]),
      ),
    )
    .toBe(true);
  // Deliberately partial: missing fields must fall back to defaults.
  await sw.evaluate(() =>
    chrome.storage.sync.set({ policy: { blockedChannels: ["@beta-channel"] } }),
  );
  await page.reload();
  await expectSkip(page, 31, 60.25); // alpha channel is not blocked

  await page.evaluate((id) => window.__fx.navigate(id), VIDEO_B.id);
  await waitForAnalysis(h.api, VIDEO_B.id);
  await page.waitForTimeout(1500);
  await expectNoSkip(page, 81);
});

test("long transcripts stay within the API cue limit and still skip", async ({
  h,
}) => {
  const page = await h.open(VIDEO_LONG.id, { variant: "legacy" });
  await waitForAnalysis(h.api, VIDEO_LONG.id);
  const call = h.api.analyzeCalls.find((c) => c.videoId === VIDEO_LONG.id)!;
  expect(call.status).toBe(200);
  expect(call.transcript.length).toBeLessThanOrEqual(5000);
  await expect
    .poll(() => tick(page, 3005), { timeout: 20_000, intervals: [200] })
    .toBeGreaterThan(3037);
  expect(await page.evaluate(() => window.__fx.time())).toBeLessThan(3042);
});

test("videos without captions are left alone", async ({ h }) => {
  const page = await h.open(VIDEO_NO_CAPTIONS.id);
  await page.waitForTimeout(8000);
  expect(h.api.analyzeCalls).toHaveLength(0);
  await expectNoSkip(page, 31);
  await expectPanelRestored(page);
});

test("videos without captions skip the SponsorBlock fallback sponsor", async ({
  h,
}) => {
  h.api.fallbackSegments.set(VIDEO_NO_CAPTIONS.id, [
    {
      id: "22222222-2222-4222-8222-222222222222",
      videoId: VIDEO_NO_CAPTIONS.id,
      channelId: null,
      startTime: 40,
      endTime: 70,
      confidence: 0.85,
      category: "sponsor",
      source: "sponsorblock",
      createdAt: new Date().toISOString(),
    },
  ]);
  const page = await h.open(VIDEO_NO_CAPTIONS.id);
  await expectSkip(page, 41, 70.25);
  expect(h.api.analyzeCalls).toHaveLength(0);
});

async function setPolicy(
  h: Harness,
  patch: Record<string, unknown>,
): Promise<void> {
  const sw = h.context().serviceWorkers()[0]!;
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

test("notify mode offers a Skip banner instead of seeking", async ({ h }) => {
  const page = await h.open(VIDEO_A.id);
  await setPolicy(h, { mode: "notify" });
  await page.reload();
  await waitForAnalysis(h.api, VIDEO_A.id);

  const skipBtn = page
    .locator("#skipsponsor-notify-host")
    .locator("button.skip");
  await expect
    .poll(async () => {
      await tick(page, 31);
      return skipBtn.count();
    })
    .toBe(1);
  expect(await page.evaluate(() => window.__fx.time())).toBeCloseTo(31, 3);
  // Shown once per entry, not on every timeupdate.
  await tick(page, 32);
  expect(await skipBtn.count()).toBe(1);

  await skipBtn.click();
  expect(await page.evaluate(() => window.__fx.time())).toBeCloseTo(60.25, 2);
  expect(await page.locator("#skipsponsor-notify-host").count()).toBe(0);
});

test("notify banner closes when playback leaves the segment", async ({ h }) => {
  const page = await h.open(VIDEO_A.id);
  await setPolicy(h, { mode: "notify" });
  await page.reload();
  await waitForAnalysis(h.api, VIDEO_A.id);
  const host = page.locator("#skipsponsor-notify-host");
  await expect
    .poll(async () => {
      await tick(page, 31);
      return host.count();
    })
    .toBe(1);
  await tick(page, 65);
  expect(await host.count()).toBe(0);
});

test("settings changes apply to the playing video without a reload", async ({
  h,
}) => {
  const page = await h.open(VIDEO_A.id);
  await expectSkip(page, 31, 60.25);

  await setPolicy(h, { mode: "off" });
  await page.waitForTimeout(500);
  await expectNoSkip(page, 31);

  await setPolicy(h, { mode: "auto" });
  await page.waitForTimeout(500);
  expect(await tick(page, 31)).toBeCloseTo(60.25, 2);
});

declare global {
  interface Window {
    __fx: {
      tick: (t: number) => number;
      time: () => number;
      navigate: (id: string) => void;
      openTranscript: () => void;
      setAd: (on: boolean) => void;
      panelState: () => { visibility: string | null; rows: number };
    };
  }
}
