#!/usr/bin/env node
// dev-tunnel: expose a local dev stack through a Cloudflare tunnel, inject the
// public URL into every process it starts, and print the webhook URLs to register.
//
// Canonical copy: ~/GitHub/notes/cto/templates/dev-tunnel/dev-tunnel.mjs
// Each repo vendors it byte-identical as scripts/dev-tunnel.mjs and keeps its
// own dev-tunnel.config.json at the repo root. Node >= 20, no dependencies.
//
// Usage:
//   node scripts/dev-tunnel.mjs                 # tunnel + setup steps + services
//   node scripts/dev-tunnel.mjs --tunnel-only   # tunnel and env file only
//   node scripts/dev-tunnel.mjs --config path/to/dev-tunnel.config.json
//
// Stable URL (optional): set DEV_TUNNEL_NAME and DEV_TUNNEL_HOSTNAME for a named
// tunnel you created with `cloudflared tunnel create` + `cloudflared tunnel route dns`.
// Without them a free quick tunnel is used (https://<random>.trycloudflare.com,
// new URL on every run, no Cloudflare account needed).
//
// Config (dev-tunnel.config.json):
// {
//   "port": 3000,                       // local port the tunnel forwards to
//   "host": "localhost",                // optional
//   "envFile": ".env.tunnel.local",     // generated, gitignored, removed on exit
//   "env": { "TUNNEL_URL": "{url}" },   // values may use {url} and {host}
//   "setup": [{ "name": "infra", "cmd": "docker compose up -d --wait" }],
//   "services": [{ "name": "web", "cmd": "pnpm dev" }],
//   "readyPath": "/",                   // local path polled before printing "ready"
//   "webhooks": [{ "name": "Dodo (test)", "path": "/api/webhooks/dodo" }],
//   "notes": ["free-form reminders printed at start"]
// }
// The generated env file never contains secrets: only URL-derived values.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync, renameSync } from "node:fs";
import { resolve, dirname } from "node:path";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

const configPath = resolve(opt("--config") ?? "dev-tunnel.config.json");
if (!existsSync(configPath)) fail(`config not found: ${configPath}`);
const root = dirname(configPath);
const cfg = JSON.parse(readFileSync(configPath, "utf8"));
if (!Number.isInteger(cfg.port)) fail("config.port must be an integer");
const host = cfg.host ?? "localhost";
const origin = `http://${host}:${cfg.port}`;
const envFile = resolve(root, cfg.envFile ?? ".env.tunnel.local");

const children = new Set();
let tunnel;
let shuttingDown = false;

function log(tag, msg) {
  process.stdout.write(`[${tag}] ${msg}\n`);
}
function fail(msg) {
  process.stderr.write(`[dev-tunnel] ${msg}\n`);
  process.exit(1);
}

function cloudflaredAvailable() {
  const r = spawnSync("cloudflared", ["--version"], { stdio: "ignore" });
  return r.status === 0;
}

function startTunnel() {
  const name = process.env.DEV_TUNNEL_NAME;
  const fixedHost = process.env.DEV_TUNNEL_HOSTNAME;
  const named = Boolean(name && fixedHost);
  const argv = named
    ? ["tunnel", "--no-autoupdate", "run", "--url", origin, name]
    : ["tunnel", "--no-autoupdate", "--url", origin];
  tunnel = spawn("cloudflared", argv, { stdio: ["ignore", "pipe", "pipe"] });
  return new Promise((resolveUrl, reject) => {
    const timer = setTimeout(() => reject(new Error("no tunnel URL after 45 s")), 45_000);
    let connected = !named;
    const onData = (buf) => {
      const text = buf.toString();
      if (process.env.DEV_TUNNEL_DEBUG) process.stderr.write(text);
      if (named) {
        if (/Registered tunnel connection/i.test(text) && !connected) {
          connected = true;
          clearTimeout(timer);
          resolveUrl(`https://${fixedHost}`);
        }
        return;
      }
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) {
        clearTimeout(timer);
        resolveUrl(m[0]);
      }
    };
    tunnel.stdout.on("data", onData);
    tunnel.stderr.on("data", onData);
    tunnel.on("exit", (code) => {
      clearTimeout(timer);
      if (!shuttingDown) reject(new Error(`cloudflared exited (${code})`));
    });
  });
}

async function waitForEdge(url) {
  // Ask a public resolver over DoH instead of fetching the URL: a lookup through
  // this Mac's resolver before the record exists gets NXDOMAIN negative-cached,
  // and the URL then fails locally for minutes while it works for Dodo/GitHub.
  const name = new URL(url).host;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${name}&type=A`, {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(5_000),
      });
      const j = await r.json();
      if (Array.isArray(j.Answer) && j.Answer.length) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return false;
}

async function waitForLocal(path, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(origin + path, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
      if (r.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1_500));
  }
  return false;
}

function expand(value, vars) {
  return String(value).replace(/\{(url|host)\}/g, (_, k) => vars[k]);
}

function writeEnvFile(env) {
  const lines = [
    "# Generated by scripts/dev-tunnel.mjs. Do not commit. Removed on exit.",
    ...Object.entries(env).map(([k, v]) => `${k}=${v}`),
    "",
  ];
  const tmp = `${envFile}.tmp`;
  writeFileSync(tmp, lines.join("\n"), { mode: 0o600 });
  renameSync(tmp, envFile);
}

function run(step, env, { wait }) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(step.cmd, {
      cwd: step.cwd ? resolve(root, step.cwd) : root,
      env: { ...process.env, ...env },
      shell: true,
      stdio: ["inherit", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    children.add(child);
    const prefix = (buf) =>
      buf
        .toString()
        .split("\n")
        .filter((l) => l.length)
        .forEach((l) => log(step.name, l));
    child.stdout.on("data", prefix);
    child.stderr.on("data", prefix);
    child.on("close", (code) => {
      children.delete(child);
      if (wait) return code === 0 ? resolveRun() : reject(new Error(`${step.name} exited ${code}`));
      if (!shuttingDown) {
        log("dev-tunnel", `${step.name} exited (${code}); stopping everything`);
        shutdown(code ?? 1);
      }
    });
    if (!wait) resolveRun();
  });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      process.kill(-c.pid, "SIGTERM");
    } catch {
      try {
        c.kill("SIGTERM");
      } catch {
        /* gone */
      }
    }
  }
  if (tunnel) tunnel.kill("SIGTERM");
  rmSync(envFile, { force: true });
  setTimeout(() => process.exit(code), 500);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  if (!cloudflaredAvailable()) fail("cloudflared not found. Install it: brew install cloudflared");
  for (const n of cfg.notes ?? []) log("note", n);
  log("dev-tunnel", `opening tunnel to ${origin} ...`);
  const url = await startTunnel().catch((e) => fail(e.message));
  const vars = { url, host: new URL(url).host };
  const env = {
    TUNNEL_URL: url,
    DEV_TUNNEL_URL: url,
    DEV_TUNNEL_HOST: vars.host,
  };
  for (const [k, v] of Object.entries(cfg.env ?? {})) env[k] = expand(v, vars);
  writeEnvFile(env);
  log("dev-tunnel", `public URL: ${url}`);
  log("dev-tunnel", `wrote ${Object.keys(env).join(", ")} to ${envFile}`);
  if (!(await waitForEdge(url))) log("dev-tunnel", "warning: tunnel edge not answering yet");

  if (flag("--tunnel-only")) {
    printWebhooks(url);
    log("dev-tunnel", "tunnel only; Ctrl+C to stop");
    return;
  }
  for (const step of cfg.setup ?? []) {
    log("dev-tunnel", `setup: ${step.name}`);
    await run(step, env, { wait: true }).catch((e) => {
      log("dev-tunnel", e.message);
      shutdown(1);
    });
    if (shuttingDown) return;
  }
  for (const svc of cfg.services ?? []) await run(svc, env, { wait: false });
  const ready = await waitForLocal(cfg.readyPath ?? "/");
  log("dev-tunnel", ready ? `local app answering on ${origin}` : `warning: ${origin} not answering yet`);
  printWebhooks(url);
  log("dev-tunnel", "running; Ctrl+C stops the services and the tunnel");
}

function printWebhooks(url) {
  for (const w of cfg.webhooks ?? []) log("webhook", `${w.name}: ${url}${w.path}`);
}

main();
