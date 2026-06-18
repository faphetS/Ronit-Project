import { describe, it, expect, vi, beforeEach } from "vitest";

// Controllable env (only the fields uman-welcome reads). Mutated per test.
// vi.hoisted so the object exists when the hoisted vi.mock factory runs.
const ENV = vi.hoisted(() => ({
  RONIT_WA_ALLOWED_NUMBERS: "639603913514",
  WA_MSG_UMAN_WELCOME_1: "שורה ראשונה\\nשורה שנייה",
  WA_MSG_UMAN_WELCOME_2: "https://www.orhazadik.online/",
}));
vi.mock("../../config/env.js", () => ({ env: ENV }));
vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../lib/dedup.js", () => ({
  isMessageProcessed: vi.fn().mockReturnValue(false),
  markMessageProcessed: vi.fn(),
}));
// Keep the real toMsisdn, mock only the network send.
vi.mock("./whatsapp.gateway.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./whatsapp.gateway.js")>()),
  sendGatewayMessage: vi.fn().mockResolvedValue(undefined),
}));

import { maybeSendUmanWelcome, isAllowed } from "./uman-welcome.service.js";
import { toMsisdn } from "./whatsapp.gateway.js";
import * as gateway from "./whatsapp.gateway.js";
import * as dedup from "../../lib/dedup.js";

const SENDER = "ig_sender_1";
const PH_ALLOWED = "+63 960 391 3514"; // → 639603913514 (allowlisted)
const IL_NUMBER = "0526949162"; // → 972526949162 (not allowlisted)

beforeEach(() => {
  vi.clearAllMocks();
  ENV.RONIT_WA_ALLOWED_NUMBERS = "639603913514";
  vi.mocked(dedup.isMessageProcessed).mockReturnValue(false);
});

describe("toMsisdn", () => {
  it("normalizes PH and IL numbers to digits + country code, no +", () => {
    expect(toMsisdn("+63 960 391 3514")).toBe("639603913514");
    expect(toMsisdn("09603913514")).toBe("639603913514"); // PH local (11)
    expect(toMsisdn("0526949162")).toBe("972526949162"); // IL local (10)
    expect(toMsisdn("972526949162")).toBe("972526949162"); // IL cc
    expect(toMsisdn("+972 52-694-9162")).toBe("972526949162");
    expect(toMsisdn("639603913514")).toBe("639603913514"); // PH cc
  });
});

describe("isAllowed", () => {
  it("matches a listed number regardless of input format; 'all' opens; '' closes", () => {
    expect(isAllowed("639603913514")).toBe(true);
    expect(isAllowed("972526949162")).toBe(false);
    ENV.RONIT_WA_ALLOWED_NUMBERS = "all";
    expect(isAllowed("972526949162")).toBe(true);
    ENV.RONIT_WA_ALLOWED_NUMBERS = "";
    expect(isAllowed("639603913514")).toBe(false);
    ENV.RONIT_WA_ALLOWED_NUMBERS = "0526949162, 639603913514"; // mixed formats
    expect(isAllowed("972526949162")).toBe(true);
  });
});

describe("maybeSendUmanWelcome", () => {
  it("uman + phone + allowlisted + unsent → sends 2 messages and marks sent", async () => {
    await maybeSendUmanWelcome({ senderId: SENDER, service: "uman", phone: PH_ALLOWED });

    expect(gateway.sendGatewayMessage).toHaveBeenCalledTimes(2);
    expect(gateway.sendGatewayMessage).toHaveBeenNthCalledWith(
      1,
      "639603913514",
      "שורה ראשונה\nשורה שנייה", // \n decoded
    );
    expect(gateway.sendGatewayMessage).toHaveBeenNthCalledWith(
      2,
      "639603913514",
      "https://www.orhazadik.online/",
    );
    expect(dedup.markMessageProcessed).toHaveBeenCalledWith("wa_uman_welcome", SENDER);
  });

  it("challah → sends nothing", async () => {
    await maybeSendUmanWelcome({ senderId: SENDER, service: "challah", phone: PH_ALLOWED });
    expect(gateway.sendGatewayMessage).not.toHaveBeenCalled();
    expect(dedup.markMessageProcessed).not.toHaveBeenCalled();
  });

  it("no phone → sends nothing", async () => {
    await maybeSendUmanWelcome({ senderId: SENDER, service: "uman", phone: null });
    expect(gateway.sendGatewayMessage).not.toHaveBeenCalled();
  });

  it("phone not on allowlist → sends nothing", async () => {
    await maybeSendUmanWelcome({ senderId: SENDER, service: "uman", phone: IL_NUMBER });
    expect(gateway.sendGatewayMessage).not.toHaveBeenCalled();
    expect(dedup.markMessageProcessed).not.toHaveBeenCalled();
  });

  it("already sent (dedup) → sends nothing", async () => {
    vi.mocked(dedup.isMessageProcessed).mockReturnValue(true);
    await maybeSendUmanWelcome({ senderId: SENDER, service: "uman", phone: PH_ALLOWED });
    expect(gateway.sendGatewayMessage).not.toHaveBeenCalled();
  });

  it("empty allowlist (fail-closed) → sends nothing", async () => {
    ENV.RONIT_WA_ALLOWED_NUMBERS = "";
    await maybeSendUmanWelcome({ senderId: SENDER, service: "uman", phone: PH_ALLOWED });
    expect(gateway.sendGatewayMessage).not.toHaveBeenCalled();
  });
});
