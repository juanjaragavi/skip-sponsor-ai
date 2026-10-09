#!/usr/bin/env node
/**
 * Validates dist/extension for Chrome Web Store submission and zips it to
 * release/skipsponsor-ai-<version>.zip.
 *
 *   npm run package:extension                 # build + checks + zip
 *   node scripts/zip-extension.mjs --allow-dev  # zip a local/dev build anyway
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist/extension");
const allowDev = process.argv.includes("--allow-dev");
const errors = [];
const warnings = [];

if (!existsSync(join(dist, "manifest.json"))) {
  console.error(
    "dist/extension/manifest.json not found. Run `npm run build:extension` first.",
  );
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const files = (function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
})(dist);

// Manifest
if (manifest.manifest_version !== 3) errors.push("manifest_version must be 3");
if (manifest.version !== pkg.version)
  errors.push(
    `manifest version ${manifest.version} != package.json ${pkg.version}`,
  );
if ((manifest.name ?? "").length > 75)
  errors.push("name exceeds 75 characters");
if ((manifest.description ?? "").length > 132)
  errors.push("description exceeds 132 characters");
if (/youtube/i.test(manifest.name ?? ""))
  errors.push("name must not contain the YouTube trademark");
for (const size of ["16", "32", "48", "128"]) {
  const icon = manifest.icons?.[size];
  if (!icon || !existsSync(join(dist, icon)))
    errors.push(`missing ${size}px icon`);
}
for (const icon of ["icons/icon-16-disabled.png", "icons/icon-32-disabled.png"])
  if (!existsSync(join(dist, icon)))
    errors.push(`missing ${icon} (used by chrome.action.setIcon)`);
const unused = (manifest.permissions ?? []).filter(
  (p) => !["storage"].includes(p),
);
if (unused.length)
  warnings.push(
    `permissions beyond "storage" need a dashboard justification: ${unused.join(", ")}`,
  );

// Bundle contents
const js = files.filter((f) => f.endsWith(".js"));
const bundle = js.map((f) => readFileSync(f, "utf8")).join("\n");
const devHosts = ["localhost", "127.0.0.1", "api.skipsponsor.example.com"];
const found = devHosts.filter((h) => bundle.includes(h));
if (found.length) {
  const msg = `bundle points at a non-production API (${found.join(", ")}). Set VITE_API_BASE_URL to the HTTPS production API in .env.production and rebuild.`;
  (allowDev ? warnings : errors).push(msg);
}
if (files.some((f) => f.endsWith(".map")))
  errors.push("source maps must not ship in the store package");
if (/\beval\(|new Function\(/.test(bundle))
  errors.push("eval/new Function found (MV3 forbids remote or dynamic code)");
if (
  /<script[^>]+src=["']https?:/i.test(
    files
      .filter((f) => f.endsWith(".html"))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n"),
  )
)
  errors.push("remote <script> in an extension page");

for (const w of warnings) console.warn(`⚠ ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}

mkdirSync(join(root, "release"), { recursive: true });
const out = join(
  root,
  "release",
  `skipsponsor-ai-${manifest.version}${allowDev && found.length ? "-dev" : ""}.zip`,
);
rmSync(out, { force: true });
execFileSync("zip", ["-r", "-X", "-q", out, ".", "-x", ".*"], { cwd: dist });
const kb = (statSync(out).size / 1024).toFixed(1);
console.log(`✓ ${relative(root, out)} (${kb} KB, ${files.length} files)`);
