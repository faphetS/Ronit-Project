import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { gql } from "./monday.client.js";

const SERVICE_TO_LABEL_ID: Record<"uman" | "poland" | "challah", number> = {
  uman: 1,
  poland: 2,
  challah: 3,
};

export interface CreateLeadInput {
  name: string;
  phone: string | null;
  service: "uman" | "poland" | "challah" | null;
  source: "instagram" | "whatsapp";
}

interface CreateItemResponse {
  create_item: { id: string };
}

export async function createLeadRow(
  input: CreateLeadInput,
): Promise<{ itemId: string }> {
  const columnValues: Record<string, unknown> = {};

  if (input.phone) {
    const digits = input.phone.replace(/\D/g, "");
    columnValues[env.MONDAY_COL_PHONE_ID] = {
      phone: digits,
      countryShortName: "IL",
    };
  }

  if (input.service) {
    columnValues[env.MONDAY_COL_SERVICE_ID] = {
      ids: [SERVICE_TO_LABEL_ID[input.service]],
    };
  }

  const mutation = /* GraphQL */ `
    mutation (
      $boardId: ID!
      $groupId: String!
      $itemName: String!
      $columnValues: JSON!
    ) {
      create_item(
        board_id: $boardId
        group_id: $groupId
        item_name: $itemName
        column_values: $columnValues
      ) {
        id
      }
    }
  `;

  const data = await gql<CreateItemResponse>(mutation, {
    boardId: env.MONDAY_BOARD_CRM_ID,
    groupId: env.MONDAY_GROUP_NEW_LEADS_ID,
    itemName: input.name,
    columnValues: JSON.stringify(columnValues),
  });

  logger.info(
    {
      itemId: data.create_item.id,
      service: input.service,
      source: input.source,
      hasPhone: !!input.phone,
    },
    "Monday CRM lead row created",
  );

  return { itemId: data.create_item.id };
}
