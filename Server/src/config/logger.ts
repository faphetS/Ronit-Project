import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "req.query.token", "req.url"],
    censor: (value: unknown, path: string[]): unknown => {
      // Strip the query string from logged URLs (keeps the path, drops ?token=… and
      // any other query secret); fully redact the header/query secrets.
      if (path[path.length - 1] === "url" && typeof value === "string") {
        return value.split("?")[0];
      }
      return "[redacted]";
    },
  },
  ...(env.NODE_ENV === "development" && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    },
  }),
});
