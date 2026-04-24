import { supabase } from "../config/supabase.js";
import { logger } from "../config/logger.js";

export async function isMessageProcessed(
  source: string,
  externalId: string,
): Promise<boolean> {
  const { data } = await supabase()
    .from("processed_webhooks")
    .select("id")
    .eq("source", source)
    .eq("external_id", externalId)
    .maybeSingle();

  return data !== null;
}

export async function markMessageProcessed(
  source: string,
  externalId: string,
): Promise<void> {
  const { error } = await supabase()
    .from("processed_webhooks")
    .upsert(
      { source, external_id: externalId },
      { onConflict: "source,external_id" },
    );

  if (error) {
    logger.warn({ error, source, externalId }, "Failed to mark message as processed");
  }
}

export interface KnownSender {
  monday_item_id: string;
  phone: string | null;
}

export async function findKnownSender(
  platform: string,
  senderId: string,
): Promise<KnownSender | null> {
  const { data } = await supabase()
    .from("known_senders")
    .select("monday_item_id, phone")
    .eq("platform", platform)
    .eq("sender_id", senderId)
    .maybeSingle();

  return data;
}

export async function upsertKnownSender(input: {
  platform: string;
  senderId: string;
  senderUsername?: string;
  mondayItemId: string;
  phone?: string | null;
}): Promise<void> {
  const { error } = await supabase()
    .from("known_senders")
    .upsert(
      {
        platform: input.platform,
        sender_id: input.senderId,
        sender_username: input.senderUsername ?? null,
        monday_item_id: input.mondayItemId,
        phone: input.phone ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "platform,sender_id" },
    );

  if (error) {
    logger.warn({ error, ...input }, "Failed to upsert known sender");
  }
}

export async function updateSenderPhone(
  platform: string,
  senderId: string,
  phone: string,
): Promise<string | null> {
  const { data, error } = await supabase()
    .from("known_senders")
    .update({ phone, updated_at: new Date().toISOString() })
    .eq("platform", platform)
    .eq("sender_id", senderId)
    .select("monday_item_id")
    .maybeSingle();

  if (error) {
    logger.warn({ error, platform, senderId }, "Failed to update sender phone");
    return null;
  }

  return data?.monday_item_id ?? null;
}
