import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Infra-agnostic ratchets (Phase 1, notes/cto/plans/2026-10-12-phase1-config-isolation-spec.md):
 *
 * 1. `.env.example` names every env var the code reads.
 * 2. No vendor hostname appears in non-test source outside the allowlist below.
 * 3. No file imports a vendor SDK outside the baseline below or an adapter directory.
 *
 * Each list only shrinks. A new hit belongs behind config (env var with the same
 * default) or behind an adapter, not in these lists; a stale entry fails too, so
 * the lists track the code exactly.
 */

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/** Directories never scanned: dependencies, build output, docs, agent tooling, tests. */
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  "playwright-report",
  "test-results",
  ".git",
  ".agents",
  ".claude",
  ".backups",
  "docs",
  "tests",
  "__tests__",
  "e2e",
]);
const CODE_EXTENSIONS = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const CONFIG_EXTENSIONS =
  /\.(?:json|jsonc|html|css|ya?ml|tf|sh|toml|sql|conf)$/;
const CONFIG_BASENAMES = /^(?:Dockerfile.*|Caddyfile)$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const LOCKFILES = new Set(["package-lock.json"]);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const hidden = entry.name.startsWith(".") && entry.name !== ".github";
      return hidden || SKIP_DIRS.has(entry.name) ? [] : walk(full);
    }
    return entry.isFile() ? [full] : [];
  });
}

const rel = (file: string): string => relative(ROOT, file).split(sep).join("/");
const read = (file: string): string => readFileSync(join(ROOT, file), "utf8");

/** Production source: code plus deploy/config files; no tests, docs or lockfiles. */
const SOURCE_FILES = walk(ROOT)
  .map(rel)
  .filter((file) => {
    const base = file.split("/").pop() ?? "";
    if (TEST_FILE.test(base) || LOCKFILES.has(base) || base.endsWith(".md"))
      return false;
    return (
      CODE_EXTENSIONS.test(base) ||
      CONFIG_EXTENSIONS.test(base) ||
      CONFIG_BASENAMES.test(base)
    );
  })
  .sort();
const CODE_FILES = SOURCE_FILES.filter((file) => CODE_EXTENSIONS.test(file));

// ---------------------------------------------------------------------------
// 1. .env.example completeness
// ---------------------------------------------------------------------------

const ENV_READ_PATTERNS = [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /process\.env\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g,
  /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g,
  // src/api/config.ts (`env["X"]`, `num("X", …)`, `flag("X")`) and vite.config.ts (`loadEnv`).
  /\benv\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g,
  /\b(?:num|flag)\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
  // COMMIT_ENV_VARS in src/api/config.ts.
  /["'](GIT_COMMIT_SHA|VERCEL_GIT_COMMIT_SHA|SOURCE_COMMIT)["']/g,
];

/** Read by code but set by the platform or dev tooling, never by an operator in `.env`. */
const ENV_EXEMPT: Record<string, string> = {
  VITEST: "set by the Vitest runner",
  DEV_TUNNEL_NAME:
    "dev-tunnel script option, documented in README (Local tunnel)",
  DEV_TUNNEL_HOSTNAME:
    "dev-tunnel script option, documented in README (Local tunnel)",
  DEV_TUNNEL_DEBUG:
    "dev-tunnel script option, documented in README (Local tunnel)",
};

function envNamesRead(): Map<string, string[]> {
  const names = new Map<string, string[]>();
  for (const file of CODE_FILES) {
    const source = read(file);
    for (const pattern of ENV_READ_PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        const name = match[1] ?? "";
        names.set(name, [...(names.get(name) ?? []), file]);
      }
    }
  }
  return names;
}

describe(".env.example completeness", () => {
  const documented = new Set(
    [...read(".env.example").matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map(
      (m) => m[1] ?? "",
    ),
  );
  const names = envNamesRead();

  it("finds the env reads it is meant to police", () => {
    for (const name of [
      "DATABASE_URL",
      "INSTALL_TOKEN_SECRET",
      "VITE_API_BASE_URL",
      "GIT_COMMIT_SHA",
    ])
      expect(names.has(name), name).toBe(true);
  });

  it("documents every env var the code reads", () => {
    const missing = [...names.keys()]
      .filter((name) => !documented.has(name) && !(name in ENV_EXEMPT))
      .map((name) => `${name} (${[...new Set(names.get(name))].join(", ")})`);
    expect(missing).toEqual([]);
  });

  it("keeps the exemption list current", () => {
    expect(Object.keys(ENV_EXEMPT).filter((name) => !names.has(name))).toEqual(
      [],
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Vendor-literal ratchet
// ---------------------------------------------------------------------------

const VENDOR_HOSTS = [
  "vercel.app",
  "supabase.co",
  "instacloud-edge.com",
  "workers.dev",
  "trycloudflare.com",
  "sslip.io",
  "amazonaws.com",
  "lambda-url",
  "firebaseapp.com",
];
const VENDOR_HOST_PATTERN = new RegExp(
  `(${VENDOR_HOSTS.map((host) => host.replace(/[.]/g, "\\.")).join("|")})(?![A-Za-z0-9-])`,
  "g",
);

/** `file|host` → why the literal stays. */
const VENDOR_LITERAL_ALLOWLIST: Record<string, string> = {
  "scripts/dev-tunnel.mjs|trycloudflare.com":
    "comment in the vendored dev-only tunnel script describing quick-tunnel URLs",
};

describe("vendor-literal ratchet", () => {
  const hits = new Set<string>();
  for (const file of SOURCE_FILES) {
    for (const match of read(file).matchAll(VENDOR_HOST_PATTERN))
      hits.add(`${file}|${match[1]}`);
  }

  it("has no vendor hostname outside config, tests, docs and the allowlist", () => {
    expect(
      [...hits].filter((hit) => !(hit in VENDOR_LITERAL_ALLOWLIST)).sort(),
    ).toEqual([]);
  });

  it("keeps the allowlist current (remove entries whose literal is gone)", () => {
    expect(
      Object.keys(VENDOR_LITERAL_ALLOWLIST).filter((hit) => !hits.has(hit)),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Vendor-SDK import ratchet
// ---------------------------------------------------------------------------

const VENDOR_SDK =
  /^(?:@supabase\/|@vercel\/|@neondatabase\/|firebase(?:-admin)?(?:\/|$)|@firebase\/|@aws-sdk\/|@upstash\/|appwrite$|node-appwrite$|@cloudflare\/|cloudflare:|dodopayments$|@dodopayments\/)/;
const IMPORT_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm;
/** Files under these directories are adapters and may import vendor SDKs. */
const ADAPTER_DIRS = [/(?:^|\/)adapters\//];

/** Today's vendor-SDK surface: none (Postgres via `pg`, Redis via `ioredis`, LLM via its HTTP SDK). */
const SDK_BASELINE: Record<string, readonly string[]> = {};

describe("vendor-SDK import ratchet", () => {
  const importers = new Map<string, string[]>();
  for (const file of CODE_FILES) {
    if (ADAPTER_DIRS.some((dir) => dir.test(file))) continue;
    const sdks = [...read(file).matchAll(IMPORT_SPECIFIER)]
      .map((m) => m[1] ?? "")
      .filter((spec) => VENDOR_SDK.test(spec));
    if (sdks.length > 0) importers.set(file, [...new Set(sdks)].sort());
  }

  it("imports vendor SDKs only from baseline files or adapters", () => {
    expect(Object.fromEntries(importers)).toEqual(SDK_BASELINE);
  });
});
