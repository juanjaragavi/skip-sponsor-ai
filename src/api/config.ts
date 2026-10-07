export const config = {
  port: Number(process.env["PORT"] ?? 3000),
  apiBase: process.env["API_BASE"] ?? "http://localhost:3000",
  anthropicKey: process.env["ANTHROPIC_API_KEY"] ?? "",
  redisUrl: process.env["REDIS_URL"] ?? "redis://localhost:6379",
  databaseUrl:
    process.env["DATABASE_URL"] ??
    "postgres://skipsponsor:skipsponsor@localhost:5432/skipsponsor",
  globalKill: process.env["GLOBAL_KILL"] === "1",
  version: "1.0.0",
};
