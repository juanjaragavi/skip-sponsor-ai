/**
 * UI flows for the "Editor's Cut" redesign: popup monitor + controls, in-player
 * in-player toasts, options page, toolbar icon state. Screenshots for design
 * review are written to artifacts/design-review/ (override: DESIGN_SHOTS).
 */
import { mkdirSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import {
  test,
  expect,
  tick,
  expectSkip,
  waitForAnalysis,
  setPolicy,
  getPolicy,
  openPopup,
  openOptions,
  extensionId,
  type Harness,
} from "./harness";
import { VIDEO_A } from "./fixtures/youtube-fixture";

const SHOTS = process.env["DESIGN_SHOTS"] ?? "artifacts/design-review";
mkdirSync(SHOTS, { recursive: true });

const LOW_CONFIDENCE = {
  id: "33333333-3333-4333-8333-333333333333",
  videoId: VIDEO_A.id,
  channelId: null,
  startTime: 90,
  endTime: 100,
  confidence: 0.64,
  category: "sponsor",
  source: "claude-haiku",
  createdAt: new Date().toISOString(),
};

const shadow = (page: Page, host: string, sel: string): Locator =>
  page.locator(`#${host}`).locator(sel);

const actionTitle = (h: Harness): Promise<string> =>
  h
    .context()
    .serviceWorkers()[0]!
    .evaluate(() => chrome.action.getTitle({}));

test("starts on the YouTube home page and skips after SPA navigation into a video", async ({
  h,
}) => {
  const page = await h.openPath("/");
  await page.evaluate((id) => window.__fx.navigate(id), VIDEO_A.id);
  await waitForAnalysis(h.api, VIDEO_A.id);
  await expectSkip(page, 31, 60.25);
});

test("cut toast: CUT tag, timecodes, Undo, mounted in the player, Esc closes", async ({
  h,
}) => {
  const page = await h.open(VIDEO_A.id);
  await expectSkip(page, 31, 60.25);
  const host = "skipsponsor-toast-host";
  expect(await page.locator(`#movie_player > #${host}`).count()).toBe(1);
  await expect(shadow(page, host, ".tag")).toHaveText("CUT");
  await expect(shadow(page, host, ".tc")).toHaveText("00:30 → 01:00");
  await expect(shadow(page, host, ".sub")).toHaveText("Sponsor · 30s skipped");
  await expect(shadow(page, host, "button.undo")).toHaveText("Undo");
  await expect(shadow(page, host, "button.close")).toHaveAttribute(
    "aria-label",
    "Dismiss",
  );
  await page.waitForTimeout(600);
  await page
    .locator("#movie_player")
    .screenshot({ path: `${SHOTS}/toast-cut.png` });

  await page.keyboard.press("Escape");
  await expect(page.locator(`#${host}`)).toHaveCount(0);
});

test("ask toast counts down to the end of the read and tracks progress", async ({
  h,
}) => {
  const page = await h.open(VIDEO_A.id);
  await setPolicy(h, { mode: "notify" });
  await page.reload();
  await waitForAnalysis(h.api, VIDEO_A.id);
  const host = "skipsponsor-notify-host";
  await expect
    .poll(async () => {
      await tick(page, 31);
      return page.locator(`#${host}`).count();
    })
    .toBe(1);
  await expect(shadow(page, host, ".tag")).toHaveText("ASK");
  await expect(shadow(page, host, ".sub")).toHaveText("Sponsor · ends in 29s");
  await tick(page, 45);
  await expect(shadow(page, host, ".sub")).toHaveText("Sponsor · ends in 15s");
  const progress = await shadow(page, host, ".strip").evaluate((el) =>
    (el as HTMLElement).style.getPropertyValue("--p"),
  );
  expect(progress).toBe("50.0%");
  await expect(shadow(page, host, "button.skip")).toHaveText("Skip");
  await page
    .locator("#movie_player")
    .screenshot({ path: `${SHOTS}/toast-ask.png` });
});

test("popup on a non-video page explains what to do", async ({ h }) => {
  await h.openPath("/");
  const popup = await openPopup(h);
  await expect(popup.locator(".edit--empty")).toHaveText(
    "Open a YouTube video to see its sponsor reads here.",
  );
  await expect(popup.locator("#timeline")).toBeHidden();
  await popup
    .locator("#popup")
    .screenshot({ path: `${SHOTS}/popup-no-video.png` });
});

test("popup offers a reload when the YouTube tab predates the extension", async ({
  h,
}) => {
  // An error page on a watch URL has no content script — same as a tab that
  // was open before the extension was installed.
  await h.openPath("/");
  const url = `https://www.youtube.com/watch?v=${VIDEO_A.id}&t=1`;
  await h.context().route(url, (route) => route.abort());
  const page = await h.context().newPage();
  await page.goto(url).catch(() => undefined);
  const tabId = await h
    .context()
    .serviceWorkers()[0]!
    .evaluate(
      async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id,
      url,
    );
  expect(tabId).toBeTruthy();
  const popup = await h.context().newPage();
  await popup.setViewportSize({ width: 340, height: 600 });
  await popup.goto(
    `chrome-extension://${extensionId(h)}/src/extension/popup.html?tab=${tabId}`,
  );
  await expect(popup.locator(".edit--empty")).toHaveText("Reading captions…");
  await expect(popup.locator("#reload-row")).toContainText(
    "SkipSponsor AI isn’t running in this tab yet.",
  );
  await popup
    .locator("#popup")
    .screenshot({ path: `${SHOTS}/popup-reload-tab.png` });

  await h.context().unroute(url);
  await popup.locator("#reload-row button").click();
  await waitForAnalysis(h.api, VIDEO_A.id);
  await expect(popup.locator(".edit:not(.edit--empty)")).toHaveCount(1);
});

test("popup monitor, live settings, toolbar icon state, channel allow-list and options page", async ({
  h,
}) => {
  h.api.extraSegments.set(VIDEO_A.id, [LOW_CONFIDENCE]);
  const page = await h.open(VIDEO_A.id, { media: true });
  await waitForAnalysis(h.api, VIDEO_A.id);
  await page.waitForTimeout(1000);
  // Real playback through the sponsor read: the extension cuts 30s -> 60s.
  await page.evaluate(async () => {
    const v = document.querySelector("video")!;
    v.currentTime = 27;
    await v.play();
  });
  await expect
    .poll(() => page.evaluate(() => window.__fx.time()), { timeout: 15_000 })
    .toBeGreaterThan(60);
  await page.evaluate(() => document.querySelector("video")!.pause());

  const popup = await openPopup(h);
  const rows = popup.locator(".edit:not(.edit--empty)");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute("data-tag", "CUT");
  await expect(rows.nth(0).locator(".edit__range")).toHaveText("00:30 → 01:00");
  await expect(rows.nth(0).locator(".edit__status")).toHaveText(
    "Skipped · 30s",
  );
  await expect(rows.nth(0).locator(".edit__conf")).toHaveText("95%");
  await expect(rows.nth(1)).toHaveAttribute("data-tag", "KEEP");
  await expect(rows.nth(1).locator(".edit__range")).toHaveText("01:30 → 01:40");
  await expect(rows.nth(1).locator(".edit__status")).toHaveText(
    "Below threshold",
  );
  await expect(popup.locator("#tc")).toHaveText(/^01:0\d \/ 02:30$/);
  await expect(popup.locator(".tl--range")).toHaveCount(2);
  await expect(popup.locator(".dot")).toHaveCount(2);
  await expect(popup.locator("#thr-help")).toContainText(
    "gets cut — 1 of 2 here.",
  );
  await expect(popup.locator("#channel-name")).toHaveText("Alpha Channel");
  await expect(popup.locator("#mode-help")).toHaveText(
    "Auto-skip — cuts marked ranges as they start",
  );
  await popup.locator("#popup").screenshot({ path: `${SHOTS}/popup-auto.png` });

  // Mode: Notify (writes storage immediately, no Save button).
  await popup.locator('.tool[data-mode="notify"]').click();
  await expect.poll(async () => (await getPolicy(h))["mode"]).toBe("notify");
  await expect(popup.locator('.tool[data-mode="notify"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(popup.locator("#mode-help")).toHaveText(
    "Notify — marks the range and shows a Skip button",
  );

  // Threshold: keyboard on the gate, 78% -> 60% brings the 64% segment in.
  await popup.locator("#threshold").focus();
  for (let i = 0; i < 18; i++) await popup.keyboard.press("ArrowLeft");
  await expect(popup.locator("#thr-value")).toHaveText("60%");
  await expect
    .poll(async () => (await getPolicy(h))["confidenceThreshold"])
    .toBe(0.6);
  await expect(rows.nth(1)).toHaveAttribute("data-tag", "ASK");
  await expect(rows.nth(1).locator(".edit__status")).toHaveText(
    "Skip button at 01:30",
  );
  await expect(popup.locator("#thr-help")).toContainText(
    "gets a Skip button — 2 of 2 here.",
  );
  await popup
    .locator("#popup")
    .screenshot({ path: `${SHOTS}/popup-notify-60.png` });

  // Master switch off: dimmed UI + grey toolbar icon/title.
  await popup.locator("#enabled").click();
  await expect
    .poll(async () => (await getPolicy(h))["globalEnabled"])
    .toBe(false);
  await expect(popup.locator("#popup")).toHaveClass(/is-off/);
  await expect
    .poll(() => actionTitle(h))
    .toBe("SkipSponsor AI — skipping is off");
  await popup.locator("#popup").screenshot({ path: `${SHOTS}/popup-off.png` });
  await popup.locator("#enabled").click();
  await expect.poll(() => actionTitle(h)).toBe("SkipSponsor AI");

  // Channel allow-list from the popup…
  await popup.locator("#channel-toggle").click();
  await expect
    .poll(async () => (await getPolicy(h))["blockedChannels"])
    .toEqual(["@alpha-channel"]);
  await expect(rows.nth(0).locator(".edit__status")).toHaveText(
    "Channel allowed",
  );
  await expect(popup.locator("#channel-name")).toHaveText(
    "Alpha Channel · skipping off",
  );

  // …shows up in the options page, where it can be removed.
  const options = await openOptions(h);
  const channel = options.locator(".channel");
  await expect(channel).toHaveCount(1);
  await expect(channel.locator(".channel__name")).toHaveText("Alpha Channel");
  await expect(channel.locator(".channel__handle")).toHaveText(
    "@alpha-channel",
  );
  await expect(channel.locator(".avatar")).toHaveText("AC");
  await expect(
    options.locator('.mode-card[data-mode="notify"]'),
  ).toHaveAttribute("aria-checked", "true");
  await expect(options.locator("#thr-value")).toHaveText("60%");
  await options.setViewportSize({ width: 1280, height: 1400 });
  await options.screenshot({ path: `${SHOTS}/options.png`, fullPage: true });

  await channel.locator("button.remove").click();
  await expect
    .poll(async () => (await getPolicy(h))["blockedChannels"])
    .toEqual([]);
  await expect(options.locator("#channel-empty")).toBeVisible();

  // Options -> popup sync is live too.
  await options.locator('.mode-card[data-mode="off"]').click();
  await expect(popup.locator('.tool[data-mode="off"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect
    .poll(() => actionTitle(h))
    .toBe("SkipSponsor AI — skipping is off");
});
