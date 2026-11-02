import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hotp, matchTotp, otpauthUrl, totpCode, totpStep } from "./totp.js";

// The shared secret of the RFC 4226 and RFC 6238 (SHA-1) test vectors.
const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");
const at = (unixSeconds: number) => new Date(unixSeconds * 1000);

describe("hotp", () => {
  it("matches the RFC 4226 test vectors", () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    expect(expected.map((_, counter) => hotp(RFC_SECRET, counter))).toEqual(expected);
  });
});

describe("totpCode", () => {
  it("matches the RFC 6238 SHA-1 test vectors, as 6 digits", () => {
    expect(totpCode(RFC_SECRET, at(59))).toBe("287082");
    expect(totpCode(RFC_SECRET, at(1111111109))).toBe("081804");
    expect(totpCode(RFC_SECRET, at(1111111111))).toBe("050471");
    expect(totpCode(RFC_SECRET, at(1234567890))).toBe("005924");
    expect(totpCode(RFC_SECRET, at(2000000000))).toBe("279037");
    expect(totpCode(RFC_SECRET, at(20000000000))).toBe("353130");
  });
});

describe("base32", () => {
  it("encodes the RFC secret the way authenticator apps expect", () => {
    expect(base32Encode(RFC_SECRET)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("round-trips, and reads lowercase, spaces and padding", () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    expect(base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq====")).toEqual(RFC_SECRET);
  });

  it("refuses characters outside the alphabet", () => {
    expect(() => base32Decode("GEZD1")).toThrow();
  });
});

describe("matchTotp", () => {
  const now = at(1111111111);
  const step = totpStep(now);

  it("accepts the current, previous and next 30 seconds, and says which step matched", () => {
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, now), now)).toBe(step);
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, at(1111111111 - 30)), now)).toBe(step - 1);
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, at(1111111111 + 30)), now)).toBe(step + 1);
  });

  it("refuses a code from a minute away", () => {
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, at(1111111111 - 60)), now)).toBeNull();
  });

  it("refuses anything that isn't six digits", () => {
    expect(matchTotp(RFC_SECRET, "05047", now)).toBeNull();
    expect(matchTotp(RFC_SECRET, "0504711", now)).toBeNull();
    expect(matchTotp(RFC_SECRET, "05047a", now)).toBeNull();
  });
});

describe("otpauthUrl", () => {
  it("builds the link authenticator apps read from a QR code", () => {
    expect(otpauthUrl({ secret: "GEZDGNBV", issuer: "Or HaTzadik", account: "ronit@example.com" })).toBe(
      "otpauth://totp/Or%20HaTzadik:ronit%40example.com?secret=GEZDGNBV&issuer=Or%20HaTzadik&algorithm=SHA1&digits=6&period=30",
    );
  });
});
