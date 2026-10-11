// Listen port: PORT (shell or .env) wins. `npm run dev:api` falls back to the
// local-only default in package.json "config.port" (3040, so several DevSpeak
// projects can run side by side); the container (`node dist/...`, no npm)
// falls back to 3000, the port infra/Dockerfile.api exposes.
const port = Number(
  process.env["PORT"] ?? process.env["npm_package_config_port"] ?? 3000,
);

export const config = {
  port,
  apiBase: process.env["API_BASE"] ?? `http://localhost:${port}`,
  anthropicKey: process.env["ANTHROPIC_API_KEY"] ?? "",
  redisUrl: process.env["REDIS_URL"] ?? "redis://localhost:6380",
  databaseUrl:
    process.env["DATABASE_URL"] ??
    "postgres://skipsponsor:skipsponsor@localhost:5434/skipsponsor",
  globalKill: process.env["GLOBAL_KILL"] === "1",
  version: "1.0.0",
};
