import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env.js";
import { AppError } from "../lib/errors.js";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError(
      503,
      "Supabase is not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_NOT_CONFIGURED",
    );
  }

  client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  return client;
}
