import { logger } from "../../config/logger.js";
import { getCurrentIgToken } from "./meta.token.service.js";

export interface IgProfile {
  id: string;
  name?: string;
  username?: string;
}

/**
 * Fetches an Instagram user's profile (name + username) using the IG Graph API.
 * Returns null on any error so callers can fall back gracefully — we don't want
 * a profile-lookup failure to drop the whole DM-processing pipeline.
 *
 * The `name` field requires the user to have opted in (followed the business,
 * messaged before, or have profile sharing on). `username` is usually returned
 * regardless.
 */
export async function fetchIgProfile(senderId: string): Promise<IgProfile | null> {
  let token: string;
  try {
    token = await getCurrentIgToken();
  } catch (err) {
    logger.warn({ err, senderId }, "Cannot fetch IG profile — token unavailable");
    return null;
  }

  const url = `https://graph.instagram.com/v23.0/${encodeURIComponent(senderId)}?fields=name,username&access_token=${encodeURIComponent(token)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn(
        { senderId, status: res.status, body: (await res.text()).slice(0, 200) },
        "IG profile lookup non-2xx",
      );
      return null;
    }
    return (await res.json()) as IgProfile;
  } catch (err) {
    logger.warn({ err, senderId }, "IG profile fetch error");
    return null;
  }
}
