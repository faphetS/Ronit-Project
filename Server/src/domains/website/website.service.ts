import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { findKnownSender, upsertKnownSender } from "../../lib/dedup.js";
import {
  createLeadRow,
  findLeadByPhoneAllBoards,
  updateLeadRow,
} from "../monday/monday.service.js";
import { maybeSendUmanWelcome } from "../whatsapp/uman-welcome.service.js";
import type { WebsiteLead } from "./website.validator.js";

export interface SubmissionResult {
  itemId: string;
  action: "updated_ig_lead" | "updated_by_phone" | "created_new";
  boardId: string;
}

/**
 * Orchestrates form submissions from the website:
 *
 *   1. If ig_id is present and matches a row in our known_senders table,
 *      update the existing Monday lead (no duplicate).
 *   2. Else, search across all boards for an existing lead with the same
 *      phone — if found, update in place.
 *   3. Else, create a new Monday lead on the CRM board.
 *
 * The dedup priority is IG first because the link is exact (one IGSID
 * always belongs to one IG user), phone second because phone is the
 * universal identifier shared across channels.
 */
export async function handleFormSubmission(
  input: WebsiteLead,
): Promise<SubmissionResult> {
  // Priority 1: IG-aware dedup
  if (input.ig_id) {
    const known = findKnownSender("instagram", input.ig_id);
    if (known) {
      await updateLeadRow(env.MONDAY_BOARD_CRM_ID, known.monday_item_id, {
        name: input.name,
        phone: input.phone,
        service: input.service ?? undefined,
        age: input.age,
        birth_date: input.birth_date,
        city: input.city,
        occupation: input.occupation,
        email: input.email,
        phone_type: input.phone_type,
        passport: input.passport,
      });
      logger.info(
        { itemId: known.monday_item_id, ig_id: input.ig_id, utm_source: input.utm_source },
        "Website form: updated IG-tracked lead",
      );
      return {
        itemId: known.monday_item_id,
        action: "updated_ig_lead",
        boardId: env.MONDAY_BOARD_CRM_ID,
      };
    }
    logger.warn(
      { ig_id: input.ig_id, utm_source: input.utm_source },
      "Website form: ig_id present but no known_senders match — falling through to phone dedup",
    );
  }

  // Priority 2: phone-based dedup across all boards
  const byPhone = await findLeadByPhoneAllBoards(input.phone);
  if (byPhone) {
    await updateLeadRow(byPhone.boardId, byPhone.itemId, {
      name: input.name,
      service: input.service ?? undefined,
      age: input.age,
      birth_date: input.birth_date,
      city: input.city,
      occupation: input.occupation,
      email: input.email,
      phone_type: input.phone_type,
      passport: input.passport,
    });
    logger.info(
      { itemId: byPhone.itemId, boardId: byPhone.boardId, phone: input.phone, utm_source: input.utm_source },
      "Website form: updated lead matched by phone",
    );

    // Link ig_id → known_senders only when the matched row is on the CRM
    // board. The IG flow assumes known_senders.monday_item_id points to a
    // CRM item; pointing it at a service-board item would break later updates.
    if (input.ig_id && byPhone.boardId === env.MONDAY_BOARD_CRM_ID) {
      upsertKnownSender({
        platform: "instagram",
        senderId: input.ig_id,
        mondayItemId: byPhone.itemId,
        phone: input.phone,
      });
    }

    return {
      itemId: byPhone.itemId,
      action: "updated_by_phone",
      boardId: byPhone.boardId,
    };
  }

  // No match — create a new lead on the CRM board
  const { itemId } = await createLeadRow({
    name: input.name,
    phone: input.phone,
    service: input.service ?? null,
    source: "website",
    age: input.age,
    birth_date: input.birth_date,
    city: input.city,
    occupation: input.occupation,
    email: input.email,
    phone_type: input.phone_type,
    passport: input.passport,
  });

  logger.info(
    { itemId, utm_source: input.utm_source },
    "Website form: created new lead",
  );

  // A brand-new website lead who chose Uman and left a phone gets the same WhatsApp
  // welcome as an IG-origin lead. Uman-only + allowlist-gated inside the call (no-ops
  // otherwise); fire-and-forget so the form response isn't delayed. Deduped on ig_id
  // when present, else the phone, so it sends at most once per person.
  void maybeSendUmanWelcome({
    senderId: input.ig_id ?? input.phone ?? "",
    service: input.service ?? null,
    phone: input.phone,
  }).catch((err) => logger.error({ err, itemId }, "Website Uman welcome failed"));

  // Link ig_id → new CRM row so a future IG DM from this lead finds the row
  // via known_senders instead of creating a duplicate.
  if (input.ig_id) {
    upsertKnownSender({
      platform: "instagram",
      senderId: input.ig_id,
      mondayItemId: itemId,
      phone: input.phone,
    });
  }

  return { itemId, action: "created_new", boardId: env.MONDAY_BOARD_CRM_ID };
}
