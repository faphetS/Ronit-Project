import { env } from "../../config/env.js";

/**
 * Zernio (zernio.com), WhatsApp's own API through one key: templates for Meta to review, and
 * template messages to a phone. Docs: https://docs.zernio.com/platforms/whatsapp/templates and
 * /messages/create-inbox-conversation.
 */

export const TEMPLATE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "PAUSED", "DISABLED", "IN_APPEAL", "PENDING_DELETION"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export function isTemplateStatus(value: unknown): value is TemplateStatus {
  return typeof value === "string" && (TEMPLATE_STATUSES as readonly string[]).includes(value);
}

/** Zernio answered with an error, or wasn't reached (status 0). `code` is Zernio's, like INVALID_TEMPLATE_PARAMS. */
export class ZernioError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ZernioError";
  }
}

export interface TemplateDraft {
  /** Lowercase letters, digits and underscores, starting with a letter. */
  name: string;
  language: string;
  /** The text with {{1}}, {{2}}… */
  body: string;
  /** A sample value for each {{n}}, for Meta's reviewers. */
  examples: string[];
}

export interface TemplateSend {
  /** Digits with the country code, no +: 972501234567. */
  to: string;
  name: string;
  language: string;
  /** One value per {{n}}, in order. */
  params: string[];
}

export interface ZernioClient {
  /** Sends a greeting's text to Meta for review, as a marketing template. */
  createTemplate(template: TemplateDraft): Promise<{ status: TemplateStatus }>;
  /** Meta's verdict on a template, or null when Meta doesn't have it (deleted). */
  templateStatus(name: string, language: string): Promise<TemplateStatus | null>;
  deleteTemplate(name: string, language: string): Promise<void>;
  /** Sends an approved template; answers with WhatsApp's message id (wamid…), which the delivery receipts carry. */
  sendTemplate(message: TemplateSend): Promise<{ messageId: string }>;
}

export interface ZernioConfig {
  apiKey: string;
  /** The connected WhatsApp account's id in Zernio. */
  accountId: string;
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function createZernioClient(config: ZernioConfig): ZernioClient {
  const base = config.baseUrl.replace(/\/+$/, "");
  const send: typeof fetch = config.fetch ?? ((input, init) => fetch(input, init));
  const account = encodeURIComponent(config.accountId);

  async function call<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await send(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(config.timeoutMs ?? 20_000),
      });
    } catch (err) {
      throw new ZernioError(0, "NETWORK_ERROR", err instanceof Error ? err.message : String(err));
    }
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = (data ?? {}) as { error?: string; code?: string };
      throw new ZernioError(response.status, error.code ?? `HTTP_${response.status}`, error.error ?? response.statusText);
    }
    return data as T;
  }

  return {
    async createTemplate({ name, language, body, examples }) {
      const { template } = await call<{ template: { status: string } }>("POST", "/whatsapp/templates", {
        accountId: config.accountId,
        name,
        category: "MARKETING",
        language,
        components: [{ type: "body", text: body, ...(examples.length > 0 ? { example: { body_text: [examples] } } : {}) }],
      });
      return { status: isTemplateStatus(template.status) ? template.status : "PENDING" };
    },

    async templateStatus(name, language) {
      try {
        const { template } = await call<{ template: { status: string } }>(
          "GET",
          `/whatsapp/templates/${encodeURIComponent(name)}?accountId=${account}&language=${encodeURIComponent(language)}`,
        );
        return isTemplateStatus(template.status) ? template.status : null;
      } catch (err) {
        if (err instanceof ZernioError && err.status === 404) return null;
        throw err;
      }
    },

    async deleteTemplate(name, language) {
      await call("DELETE", `/whatsapp/templates/${encodeURIComponent(name)}?accountId=${account}&language=${encodeURIComponent(language)}`);
    },

    async sendTemplate({ to, name, language, params }) {
      const { data } = await call<{ data: { messageId: string } }>("POST", "/inbox/conversations", {
        accountId: config.accountId,
        participantId: to,
        templateName: name,
        templateLanguage: language,
        templateParams: params,
      });
      return { messageId: data.messageId };
    },
  };
}

/** The client when ZERNIO_API_KEY and ZERNIO_WHATSAPP_ACCOUNT_ID are set; null otherwise (WhatsApp not connected). */
export function zernioFromEnv(): ZernioClient | null {
  if (!env.ZERNIO_API_KEY || !env.ZERNIO_WHATSAPP_ACCOUNT_ID) return null;
  return createZernioClient({ apiKey: env.ZERNIO_API_KEY, accountId: env.ZERNIO_WHATSAPP_ACCOUNT_ID, baseUrl: env.ZERNIO_API_URL });
}
