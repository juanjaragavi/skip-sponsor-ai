/**
 * Platform-standard guards (portfolio platform standard, 2026-10-12):
 *
 * 1. Provider-neutral copy: the message catalog and every rendered extension
 *    source (scripts, pages, styles, manifest) must not name a hosting
 *    vendor. Third parties the user must see (YouTube, the community
 *    segment source) are not on the banned list.
 * 2. Adapter boundary: backing-service SDKs are imported only by their one
 *    adapter module. Tests are exempt (they build fakes and real clients).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const BANNED_VENDORS =
  /supabase|firebase|appwrite|instacloud|insforge|amazonaws|vercel/i;
/** Unavoidable third-party names (file → reason). None today. */
const VENDOR_ALLOWLIST: Record<string, string> = {};

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return e.name === "tests" ? [] : walk(full);
    return [full];
  });
}
const rel = (f: string): string => relative(ROOT, f).split(sep).join("/");
const TEST = /\.(test|spec)\.ts$/;

describe("provider-neutral user-visible text", () => {
  const files = walk(join(ROOT, "src/extension"))
    .map(rel)
    .filter((f) => /\.(ts|html|css|json)$/.test(f) && !TEST.test(f));

  it("scans the catalog and the rendered extension sources", () => {
    expect(files).toContain("src/extension/user-messages.ts");
    expect(files).toContain("src/extension/popup.html");
    expect(files).toContain("src/extension/manifest.json");
  });

  it("names no hosting vendor", () => {
    const hits = files
      .filter((f) => !(f in VENDOR_ALLOWLIST))
      .flatMap((f) =>
        readFileSync(join(ROOT, f), "utf8")
          .split("\n")
          .map((line, i) => ({ f, i: i + 1, line }))
          .filter(({ line }) => BANNED_VENDORS.test(line)),
      )
      .map(({ f, i, line }) => `${f}:${i}: ${line.trim()}`);
    expect(hits).toEqual([]);
  });

  it("the guard catches a vendor name (mutation check)", () => {
    expect(BANNED_VENDORS.test("Hosted on InstaCloud")).toBe(true);
    expect(BANNED_VENDORS.test("api.amazonaws.com")).toBe(true);
    expect(BANNED_VENDORS.test("DevSpeak Labs Cloud")).toBe(false);
  });
});

/** SDK → the one adapter module allowed to import it. */
const ADAPTERS: Record<string, string> = {
  pg: "src/api/db/connection.ts",
  ioredis: "src/api/repositories/redis-cache.ts",
  "@anthropic-ai/sdk": "src/api/services/llm-client.ts",
};

const IMPORT_RE =
  /(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;

function importsOf(source: string): string[] {
  return [...source.matchAll(IMPORT_RE)].map(
    (m) => (m[1] ?? m[2] ?? m[3] ?? m[4])!,
  );
}

const pkgOf = (spec: string): string =>
  spec.startsWith("@")
    ? spec.split("/").slice(0, 2).join("/")
    : spec.split("/")[0]!;

describe("adapter boundary", () => {
  const files = walk(join(ROOT, "src"))
    .map(rel)
    .filter((f) => /\.tsx?$/.test(f) && !TEST.test(f));

  it("imports each backing-service SDK only from its adapter", () => {
    const offenders = files.flatMap((f) =>
      importsOf(readFileSync(join(ROOT, f), "utf8"))
        .map(pkgOf)
        .filter((p) => p in ADAPTERS && ADAPTERS[p] !== f)
        .map((p) => `${f} imports ${p} (adapter: ${ADAPTERS[p]})`),
    );
    expect(offenders).toEqual([]);
  });

  it("every adapter exists and imports its SDK", () => {
    for (const [pkg, file] of Object.entries(ADAPTERS))
      expect(
        importsOf(readFileSync(join(ROOT, file), "utf8")).map(pkgOf),
      ).toContain(pkg);
  });

  it("the scanner sees static, type-only, dynamic and require imports", () => {
    expect(
      importsOf(
        `import pg from "pg";\nimport type { Pool } from "pg";\nconst r = await import("ioredis");\nconst a = require("@anthropic-ai/sdk/core");`,
      ).map(pkgOf),
    ).toEqual(["pg", "pg", "ioredis", "@anthropic-ai/sdk"]);
  });
});
