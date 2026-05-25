import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../lib/errors.js";

interface TokenFile {
  ig_access_token: string;
  expires_at: string;
  refreshed_at: string;
}

interface RefreshResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

const SIXTY_DAYS_SECONDS = 60 * 24 * 60 * 60;
const CACHE_TTL_MS = 60_000;

let cache: { token: string; expiresAt: Date; fetchedAt: number } | null = null;

async function readTokenFile(): Promise<TokenFile | null> {
  try {
    const raw = await fs.readFile(env.META_TOKEN_FILE_PATH, "utf8");
    return JSON.parse(raw) as TokenFile;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function writeTokenFile(data: TokenFile): Promise<void> {
  await fs.mkdir(dirname(env.META_TOKEN_FILE_PATH), { recursive: true });
  await fs.writeFile(env.META_TOKEN_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
}

/**
 * Returns the current IG long-lived access token. On first call (file missing),
 * bootstraps from env.IG_ACCESS_TOKEN with an assumed 60-day lifetime.
 */
export async function getCurrentIgToken(): Promise<string> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.token;
  }

  const file = await readTokenFile();

  if (file) {
    cache = { token: file.ig_access_token, expiresAt: new Date(file.expires_at), fetchedAt: Date.now() };
    return file.ig_access_token;
  }

  if (!env.IG_ACCESS_TOKEN) {
    throw new AppError(
      503,
      "IG token not configured — no token file and IG_ACCESS_TOKEN missing",
      "IG_TOKEN_NOT_CONFIGURED",
    );
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SIXTY_DAYS_SECONDS * 1000);
  const bootstrap: TokenFile = {
    ig_access_token: env.IG_ACCESS_TOKEN,
    expires_at: expiresAt.toISOString(),
    refreshed_at: now.toISOString(),
  };
  await writeTokenFile(bootstrap);
  cache = { token: bootstrap.ig_access_token, expiresAt, fetchedAt: Date.now() };
  logger.info(
    { path: env.META_TOKEN_FILE_PATH, expiresAt: bootstrap.expires_at },
    "IG token bootstrapped from env to file",
  );
  return bootstrap.ig_access_token;
}

/**
 * Returns the cached/file expiry date, or null if not yet bootstrapped.
 * Used by the cron to decide whether to refresh proactively.
 */
export async function getIgTokenExpiry(): Promise<Date | null> {
  const file = await readTokenFile();
  return file ? new Date(file.expires_at) : null;
}

/**
 * Calls Meta's /refresh_access_token to extend the long-lived IG token by
 * another ~60 days and writes the new value to the token file. Per Meta docs,
 * the existing token must be at least 24 hours old to be refreshable.
 */
export async function refreshIgToken(): Promise<void> {
  const current = await getCurrentIgToken();

  const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(current)}`;
  const res = await fetch(url);

  if (!res.ok) {
    const body = await res.text();
    throw new AppError(
      502,
      `IG refresh_access_token HTTP ${res.status}: ${body.slice(0, 300)}`,
      "IG_REFRESH_HTTP_ERROR",
    );
  }

  const data = (await res.json()) as RefreshResponse;
  if (!data.access_token || !data.expires_in) {
    throw new AppError(
      502,
      `IG refresh returned malformed response: ${JSON.stringify(data).slice(0, 200)}`,
      "IG_REFRESH_BAD_RESPONSE",
    );
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + data.expires_in * 1000);
  await writeTokenFile({
    ig_access_token: data.access_token,
    expires_at: expiresAt.toISOString(),
    refreshed_at: now.toISOString(),
  });
  cache = { token: data.access_token, expiresAt, fetchedAt: Date.now() };

  logger.info(
    { expiresAt: expiresAt.toISOString(), expiresInDays: Math.round(data.expires_in / 86400) },
    "IG token refreshed",
  );
}
