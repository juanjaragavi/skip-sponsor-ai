/**
 * Regression tests for the endless skip loop reported on real YouTube.
 * Root causes: (1) seeking by writing video.currentTime behind the player's
 * back, which YouTube's player can undo; (2) no limit on retries, so the
 * extension and the player fought ~4 times a second; (3) YouTube's own seeks
 * were treated as the user choosing to watch a sponsor read.
 */
import {
  test,
  expect,
  tick,
  expectSkip,
  waitForAnalysis,
  openPopup,
} from "./harness";
import { VIDEO_A } from "./fixtures/youtube-fixture";

test("skips through YouTube's player API (movie_player.seekTo)", async ({
  h,
}) => {
  const page = await h.open(VIDEO_A.id);
  await expectSkip(page, 31, 60.25);
  expect(await page.evaluate(() => window.__fx.seekCalls)).toEqual([60.25]);
});

test("a player that refuses the seek gets at most 2 attempts — no loop", async ({
  h,
}) => {
  const page = await h.open(VIDEO_A.id, { resistSeeks: true });
  await waitForAnalysis(h.api, VIDEO_A.id);
  // Keep reporting playback inside the sponsor read for 10s (~40 updates):
  // the old code would seek on every single one of them.
  await expect
    .poll(async () => {
      await tick(page, 31);
      return (await page.evaluate(() => window.__fx.seekCalls)).length;
    })
    .toBeGreaterThan(0);
  for (let i = 0; i < 40; i++) {
    await tick(page, 31);
    await page.waitForTimeout(250);
  }
  expect(await page.evaluate(() => window.__fx.seekCalls)).toEqual([
    60.25, 60.25,
  ]);
  expect(await page.evaluate(() => window.__fx.time())).toBeCloseTo(31, 3);
  await expect
    .poll(() => h.api.telemetry.map((t) => t.eventType))
    .toContain("skip_bounced");

  const popup = await openPopup(h);
  await expect(popup.locator(".edit__status").first()).toHaveText(
    "YouTube’s player blocked the skip",
  );
});

test("YouTube's own seek into a sponsor read doesn't cancel the skip; the user's does", async ({
  h,
}) => {
  const page = await h.open(VIDEO_A.id, { media: true });
  await waitForAnalysis(h.api, VIDEO_A.id);
  await page.waitForTimeout(1000);

  // Programmatic seek (no user input), e.g. YouTube restoring a position.
  await page.evaluate(async () => {
    const v = document.querySelector("video")!;
    v.currentTime = 35;
    await v.play();
  });
  await expect
    .poll(() => page.evaluate(() => window.__fx.time()), { timeout: 10_000 })
    .toBeGreaterThan(60);

  // A real click right before the seek = the user chose to watch it.
  await page.mouse.click(400, 300);
  await page.evaluate(async () => {
    const v = document.querySelector("video")!;
    v.currentTime = 40;
    await v.play();
  });
  await page.waitForTimeout(2500);
  const t = await page.evaluate(() => window.__fx.time());
  expect(t).toBeGreaterThan(40);
  expect(t).toBeLessThan(60);
});
