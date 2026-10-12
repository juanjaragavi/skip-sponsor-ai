/**
 * Structured logs (portfolio platform standard): one JSON object per line on
 * stdout with `ts`, `level`, `service`, `msg` and, inside a request,
 * `correlation_id`. Secrets, tokens and request bodies are never logged: the
 * request serializer keeps method and path only.
 */
import pino, { type LoggerOptions } from "pino";

export const SERVICE_NAME = "skip-sponsor-ai/api";

interface RawRequest {
  method?: string;
  url?: string;
}

export function loggerOptions(service: string = SERVICE_NAME): LoggerOptions {
  return {
    base: { service },
    messageKey: "msg",
    timestamp: () => `,"ts":"${new Date().toISOString()}"`,
    formatters: { level: (label) => ({ level: label }) },
    serializers: {
      // Path without the query string: no tokens or ids from query params.
      req: (req: RawRequest) => ({
        method: req.method,
        path: (req.url ?? "").split("?")[0],
      }),
      res: (res: { statusCode?: number }) => ({ status: res.statusCode }),
    },
  };
}

/** Logger for code that runs outside a Fastify instance (startup checks). */
export function createLogger(service: string = SERVICE_NAME): pino.Logger {
  return pino(loggerOptions(service));
}
