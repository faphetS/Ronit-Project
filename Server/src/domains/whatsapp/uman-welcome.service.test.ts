import { describe, it, expect, vi, beforeEach } from "vitest";

// Controllable env (only the fields uman-welcome reads). Mutated per test.
// vi.hoisted so the object exists when the hoisted vi.mock factory runs.
const ENV = vi.hoisted(() => ({
  RONIT_WA_ALLOWED_NUMBERS: "639603913514",
  WA_MSG_UMAN_WELCOME_1: "שורה ראשונה\\nשורה שנייה",
  WA_MSG_UMAN_WELCOME_2: "https://www.orhazadik.online/",
  WA_WELCOME_BUBBLE_DELAY_MS: 0, // no real delay in tests
}));
vi.mock("../../config/env.js", () => ({ env: ENV }));
vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../lib/dedup.js", () => ({
  isMessageProcessed: vi.fn().mockReturnValue(false),
  markMessageProcessed: vi.fn(),
}));
// Keep the real toMsisdn + isValidMsisdn, mock only the network send.
vi.mock("./whatsapp.gateway.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./whatsapp.gateway.js")>()),
  sendGatewayMessage: vi.fn().mockResolvedValue(true),
}));

import { maybeSendUmanWelcome, isAllowed } from "./uman-welcome.service.js";
import { toMsisdn, isValidMsisdn } from "./whatsapp.gateway.js";
import * as gateway from "./whatsapp.gateway.js";
import * as dedup from "../../lib/dedup.js";

const SENDER = "ig_sender_1";
const PH_ALLOWED = "+63 960 391 3514"; // → 639603913514 (allowlisted)
const IL_VALID = "0521234567"; // → 972521234567 (valid mobile, not allowlisted)
const IL_LANDLINE = "0312345678"; // → 972312345678 (NOT a mobile → invalid)

beforeEach(() => {
  vi.clearAllMocks();
  ENV.RONIT_WA_ALLOWED_NUMBERS = "639603913514";
  vi.mocked(dedup.isMessageProcessed).mockReturnValue(false);
  vi.mocked(gateway.sendGatewayMessage).mockResolvedValue(true);
});

describe("toMsisdn", () => {
  it("normalizes the real mess: PH, IL mobile, +972, kept-0, bare 9-digit, 00-prefix", () => {
    expect(toMsisdn("+63 960 391 3514")).toBe("639603913514");
    expect(toMsisdn("09603913514")).toBe("639603913514"); // PH local (11)
    expect(toMsisdn("0526949162")).toBe("972526949162"); // IL local (10)
    expect(toMsisdn("972526949162")).toBe("972526949162"); // IL cc
    expect(toMsisdn("+972 52-694-9162")).toBe("972526949162");
    expect(toMsisdn("526949162")).toBe("972526949162"); // bare IL mobile (leading 0 dropped)
    expect(toMsisdn("00972526949162")).toBe("972526949162"); // 00 trunk prefix
    expect(toMsisdn("+972 0 52 694 9162")).toBe("972526949162"); // kept national 0 after +972
  });
});

describe("isValidMsisdn", () => {
  it("accepts only IL/PH mobiles; rejects landlines and junk", () => {
    expect(isValidMsisdn("972526949162")).toBe(true); // IL mobile
    expect(isValidMsisdn("639603913514")).toBe(true); // PH mobile
    expect(isValidMsisdn("972312345678")).toBe(false); // IL landline (03)
    expect(isValidMsisdn("501234567")).toBe(false); // bare, wrong length
    expect(isValidMsisdn("")).toBe(false);
  });
});

describe("isAllowed", () => {
  it("matches a listed number in any format; 'all' opens; '' closes", () => {
    expect(isAllowed("639603913514")).toBe(true);
    expect(isAllowed("972526949162")).toBe(false);
    ENV.RONIT_WA_ALLOWED_NUMBERS = "all";
    expect(isAllowed("972526949162")).toBe(true);
    ENV.RONIT_WA_ALLOWED_NUMBERS = "";
    expect(isAllowed("639603913514")).toBe(false);
  });
});

describe("maybeSendUmanWelcome", () => {
  it("uman + valid + allowlisted + unsent, both sends OK → 2 messages + marks", async () => {
    await maybeSendUmanWelcome({ senderId: SENDER, service: "uman", phone: PH_ALLOWED });

    expect(gateway.sendGatewayMessage).toHaveBeenCalledTimes(2);
    expect(gateway.sendGatewayMessage).toHaveBeenNthCalledWith(1, "639603913514", "שורה ראשונה\nשורה שנייה");
    expect(gateway.sendGatewayMessage).toHaveBeenNthCalledWith(2, "639603913514", "https://www.orhazadik.online/");
    expect(dedup.markMessageProcessed).toHaveBeenCalledWith("wa_uman_welcome", SENDER);
  });

  it("bubble 1 fails → does NOT send bubble 2 and does NOT mark (retryable)", async () => {
    vi.mocked(gateway.sendGatewayMessage).mockResolvedValueOnce(false);
    await maybeSendUmanWelcome({ senderId: SENDER, service: "uman", phone: PH_ALLOWED });

    expect(gateway.sendGatewayMessage).toHaveBeenCalledTimes(1);
    expect(dedup.markMessageProcessed).not.toHaveBeenCalled();
  });

  it("bubble 2 fails → full welcome NOT marked (retryable); bubble 1 marked done so it won't resend", async () => {
    vi.mocked(gateway.sendGatewayMessage)
      .mockResolvedValueOnce(true) // bubble 1
      .mockResolvedValueOnce(false); // bubble 2
    await maybeSendUmanWelcome({ senderId: SENDER, service: "uman", phone: PH_ALLOWED });

    expect(gateway.sendGatewayMessage).toHaveBeenCalledTimes(2);
    expect(dedup.markMessageProcessed).not.toHaveBeenCalledWith("wa_uman_welcome", SENDER);
    expect(dedup.markMessageProcessed).toHaveBeenCalledWith("wa_uman_welcome_b1", SENDER);
  });

  it("retry after a bubble-2 failure re-sends ONLY bubble 2 — bubble 1 is never sent twice", async () => {
    const marked = new Set<string>();
    vi.mocked(dedup.isMessageProcessed).mockImplementation((s: string, id: string) => marked.has(`${s}:${id}`));
    vi.mocked(dedup.markMessageProcessed).mockImplementation((s: string, id: string) => {
      marked.add(`${s}:${id}`);
    });
    vi.mocked(gateway.sendGatewayMessage)
      .mockResolvedValueOnce(true) // attempt 1: bubble 1 ok
      .mockResolvedValueOnce(false) // attempt 1: bubble 2 fails
      .mockResolvedValueOnce(true); // retry: bubble 2 ok

    await maybeSendUmanWelcome({ senderId: SENDER, service: "uman", phone: PH_ALLOWED }); // attempt 1
    await maybeSendUmanWelcome({ senderId: SENDER, service: "uman", phone: PH_ALLOWED }); // retry

    const calls = vi.mocked(gateway.sendGatewayMessage).mock.calls;
    expect(calls.length).toBe(3); // bubble 1 once + bubble 2 twice (NOT 4)
    expect(calls.filter((c) => c[1] === "שורה ראשונה\nשורה שנייה").length).toBe(1); // bubble 1 exactly once
    expect(calls.filter((c) => c[1] === "https://www.orhazadik.online/").length).toBe(2); // bubble 2 retried
    expect(marked.has(`wa_uman_welcome:${SENDER}`)).toBe(true); // eventually fully marked
  });

  it("invalid msisdn (IL landline) → nothing sent, NOT marked", async () => {
    ENV.RONIT_WA_ALLOWED_NUMBERS = "all";
    await maybeSendUmanWelcome({ senderId: SENDER, service: "uman", phone: IL_LANDLINE });
    expect(gateway.sendGatewayMessage).not.toHaveBeenCalled();
    expect(dedup.markMessageProcessed).not.toHaveBeenCalled();
  });

  it("challah → nothing", async () => {
    await maybeSendUmanWelcome({ senderId: SENDER, service: "challah", phone: PH_ALLOWED });
    expect(gateway.sendGatewayMessage).not.toHaveBeenCalled();
  });

  it("no phone → nothing", async () => {
    await maybeSendUmanWelcome({ senderId: SENDER, service: "uman", phone: null });
    expect(gateway.sendGatewayMessage).not.toHaveBeenCalled();
  });

  it("valid but not allowlisted → nothing", async () => {
    await maybeSendUmanWelcome({ senderId: SENDER, service: "uman", phone: IL_VALID });
    expect(gateway.sendGatewayMessage).not.toHaveBeenCalled();
    expect(dedup.markMessageProcessed).not.toHaveBeenCalled();
  });

  it("already sent (dedup) → nothing", async () => {
    vi.mocked(dedup.isMessageProcessed).mockReturnValue(true);
    await maybeSendUmanWelcome({ senderId: SENDER, service: "uman", phone: PH_ALLOWED });
    expect(gateway.sendGatewayMessage).not.toHaveBeenCalled();
  });

  it("empty allowlist (fail-closed) → nothing", async () => {
    ENV.RONIT_WA_ALLOWED_NUMBERS = "";
    await maybeSendUmanWelcome({ senderId: SENDER, service: "uman", phone: PH_ALLOWED });
    expect(gateway.sendGatewayMessage).not.toHaveBeenCalled();
  });

  it("in-flight guard: two concurrent calls for the same sender → only one welcome (2 sends, not 4)", async () => {
    const p1 = maybeSendUmanWelcome({ senderId: SENDER, service: "uman", phone: PH_ALLOWED });
    const p2 = maybeSendUmanWelcome({ senderId: SENDER, service: "uman", phone: PH_ALLOWED });
    await Promise.all([p1, p2]);
    expect(gateway.sendGatewayMessage).toHaveBeenCalledTimes(2);
    const fullMarks = vi
      .mocked(dedup.markMessageProcessed)
      .mock.calls.filter((c) => c[0] === "wa_uman_welcome");
    expect(fullMarks.length).toBe(1);
  });
});
