#!/usr/bin/env node
/**
 * Generates the SkipSponsor AI brand mark and extension icons from the
 * geometry in design/SkipSponsorAI.pen ("01 Brand — Logo System").
 *
 *   brand/svg/*.svg      vector masters (mark, mono, per-size icons)
 *   public/icons/*.png   extension icons (copied verbatim into the build)
 *   store/store-icon-128.png
 *
 * PNGs are rendered with Playwright's Chromium so they match the SVG exactly.
 * Run: node scripts/build-icons.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VIOLET = "#7B61FF";
const DISABLED = "#8A919E";

/** Master art on a 64-unit grid ("Mark / Tile" components). */
const MASTER = {
  viewBox: 64,
  radius: 16,
  segment:
    "M24 41h16a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5h-16a2.5 2.5 0 0 1-2.5-2.5v-5a2.5 2.5 0 0 1 2.5-2.5z",
  track:
    "M11 43h6a3 3 0 0 1 0 6h-6a3 3 0 0 1 0-6z m36 0h6a3 3 0 0 1 0 6h-6a3 3 0 0 1 0-6z",
  leap: "M15 37q17-29 34 0m-9-3l9.5 3.5 2-10",
  stroke: 5,
};
/** Pixel-snapped 32px glyph ("Icon 32"). */
const ICON32 = {
  viewBox: 32,
  radius: 7,
  segment:
    "M11.5 21h9a1.5 1.5 0 0 1 1.5 1.5v2a1.5 1.5 0 0 1-1.5 1.5h-9a1.5 1.5 0 0 1-1.5-1.5v-2a1.5 1.5 0 0 1 1.5-1.5z",
  track:
    "M5 22h2.5a1.5 1.5 0 0 1 0 3h-2.5a1.5 1.5 0 0 1 0-3z m19.5 0h2.5a1.5 1.5 0 0 1 0 3h-2.5a1.5 1.5 0 0 1 0-3z",
  leap: "M8 18q8-14 16 0m-4.5-1.5l5 2 1-5",
  stroke: 2.5,
};
/** 16px glyph keeps only the leap and the segment ("Icon 16"). */
const ICON16 = {
  viewBox: 16,
  radius: 3.5,
  segment:
    "M5 11h6a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1z",
  track: null,
  leap: "M3.5 9q4.5-7.5 9 0m-2.5-0.5l2.6 0.9 0.6-2.8",
  stroke: 1.6,
};

/**
 * @param {typeof MASTER} g geometry
 * @param {{tile?: string, art?: string, segmentOpacity?: number, opacity?: number, padding?: number}} o
 */
function svg(g, o = {}) {
  const {
    tile = VIOLET,
    art = "#FFFFFF",
    segmentOpacity = 0.35,
    opacity = 1,
    padding = 0,
  } = o;
  const v = g.viewBox;
  const total = v + padding * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total}" height="${total}">
  <g transform="translate(${padding} ${padding})" opacity="${opacity}">
    <rect width="${v}" height="${v}" rx="${g.radius}" fill="${tile}"/>
    <path d="${g.segment}" fill="${art}" fill-opacity="${segmentOpacity}"/>
    ${g.track ? `<path d="${g.track}" fill="${art}"/>` : ""}
    <path d="${g.leap}" fill="none" stroke="${art}" stroke-width="${g.stroke}" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>
`;
}

const vectors = {
  "mark.svg": svg(MASTER),
  "mark-mono-black.svg": svg(MASTER, { tile: "#000000" }),
  "mark-mono-white.svg": svg(MASTER, {
    tile: "#FFFFFF",
    art: "#0E1116",
    segmentOpacity: 0.3,
  }),
  "icon-16.svg": svg(ICON16),
  "icon-32.svg": svg(ICON32),
  "icon-16-disabled.svg": svg(ICON16, { tile: DISABLED, opacity: 0.45 }),
  "icon-32-disabled.svg": svg(ICON32, { tile: DISABLED, opacity: 0.45 }),
  // 128 = 96px art centred with 16px transparent padding (Web Store rule):
  // the 64-unit master scaled by 1.5 plus 16px padding at 1.5x => padding 32/3 units.
  "icon-128.svg": svg(MASTER, { padding: 64 / 6 }),
};

const rasters = [
  ["public/icons/icon-16.png", "icon-16.svg", 16],
  ["public/icons/icon-32.png", "icon-32.svg", 32],
  ["public/icons/icon-48.png", "mark.svg", 48],
  ["public/icons/icon-128.png", "icon-128.svg", 128],
  ["public/icons/icon-16-disabled.png", "icon-16-disabled.svg", 16],
  ["public/icons/icon-32-disabled.png", "icon-32-disabled.svg", 32],
  ["store/store-icon-128.png", "icon-128.svg", 128],
  ["brand/png/mark-512.png", "mark.svg", 512],
  ["brand/png/mark-1024.png", "mark.svg", 1024],
];

mkdirSync(join(root, "brand/svg"), { recursive: true });
for (const [name, content] of Object.entries(vectors)) {
  writeFileSync(join(root, "brand/svg", name), content);
}

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [out, src, size] of rasters) {
  const markup = vectors[src].replace(
    /width="[^"]+" height="[^"]+"/,
    `width="${size}" height="${size}"`,
  );
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${markup}</body></html>`,
  );
  mkdirSync(dirname(join(root, out)), { recursive: true });
  await page
    .locator("svg")
    .screenshot({ path: join(root, out), omitBackground: true });
  console.log(`${out} (${size}x${size})`);
}
await browser.close();
