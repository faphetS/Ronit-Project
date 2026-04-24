import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";

const MONDAY_URL = "https://api.monday.com/v2";
const API_VERSION = "2025-04";

interface GqlResponse<T> {
  data?: T;
  errors?: unknown;
}

export async function gql<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  if (!env.MONDAY_API_TOKEN) {
    throw new AppError(
      503,
      "Monday not configured — MONDAY_API_TOKEN missing",
      "MONDAY_NOT_CONFIGURED",
    );
  }

  const res = await fetch(MONDAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: env.MONDAY_API_TOKEN,
      "API-Version": API_VERSION,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new AppError(
      502,
      `Monday HTTP ${res.status}: ${body.slice(0, 300)}`,
      "MONDAY_HTTP_ERROR",
    );
  }

  const json = (await res.json()) as GqlResponse<T>;

  if (json.errors) {
    throw new AppError(
      502,
      `Monday GraphQL error: ${JSON.stringify(json.errors).slice(0, 400)}`,
      "MONDAY_GRAPHQL_ERROR",
    );
  }

  if (!json.data) {
    throw new AppError(502, "Monday returned no data", "MONDAY_NO_DATA");
  }

  return json.data;
}
