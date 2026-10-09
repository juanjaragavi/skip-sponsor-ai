import {
  test,
  expect,
  tick,
  expectSkip,
  expectNoSkip,
  waitForAnalysis,
  uploadedText,
  expectPanelRestored,
  setPolicy,
} from "./harness";
import {
  VIDEO_A,
  VIDEO_B,
  VIDEO_LONG,
  VIDEO_NO_CAPTIONS,
} from "./fixtures/youtube-fixture";

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
    () => document.querySelectorAll("html > style, .toast, .wrap").length,
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
    await page.evaluate(
      () => document.querySelectorAll(".toast, .wrap").length,
    ),
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
