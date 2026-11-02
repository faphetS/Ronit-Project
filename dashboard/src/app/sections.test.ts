import { describe, expect, it } from "vitest";
import { desktopPageKey, isPushedRoute, parentOf, phoneTabFor } from "./sections";

describe("sections", () => {
  it("knows which phone screens slide over the one below", () => {
    expect(isPushedRoute("/customers/c1")).toBe(true);
    expect(isPushedRoute("/leads/l1")).toBe(true);
    expect(isPushedRoute("/users")).toBe(true);
    expect(isPushedRoute("/import")).toBe(true);
    expect(isPushedRoute("/customers")).toBe(false);
    expect(isPushedRoute("/groups/g1")).toBe(false);
  });

  it("finds where a pushed screen goes back to", () => {
    expect(parentOf("/customers/c1")).toBe("/customers");
    expect(parentOf("/leads/l1")).toBe("/leads");
    expect(parentOf("/import")).toBe("/users");
    expect(parentOf("/users")).toBe("/");
  });

  it("maps paths to phone tabs", () => {
    expect(phoneTabFor("/")).toBe("home");
    expect(phoneTabFor("/customers/c1")).toBe("customers");
    expect(phoneTabFor("/greetings/birthdays")).toBe("greetings");
    expect(phoneTabFor("/import")).toBe("home");
  });

  it("keeps the lead panel and the selected group on their desktop page", () => {
    expect(desktopPageKey("/leads/l1")).toBe("/leads");
    expect(desktopPageKey("/groups/g1")).toBe("/groups");
    expect(desktopPageKey("/customers/c1")).toBe("/customers/c1");
  });
});
