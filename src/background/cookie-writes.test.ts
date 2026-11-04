import { describe, expect, test } from "bun:test";
import { firstPartyChangeFrom } from "./cookie-writes.ts";

const NOW = 1_800_000_000;
const SIGN_IN = new URL("https://app.corp.example:8443/auth/sign-in?next=/");

describe("reading what a Set-Cookie header asks for", () => {
  test("a session cookie keeps its attributes and belongs to the response's address", () => {
    expect(
      firstPartyChangeFrom(
        "sid=abc=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=60",
        SIGN_IN,
        NOW,
      ),
    ).toEqual({
      kind: "write",
      cookie: {
        url: "https://app.corp.example:8443/",
        name: "sid",
        value: "abc=",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "lax",
        expirationDate: NOW + 60,
      },
    });
  });

  test("a cookie for the whole domain keeps its domain", () => {
    const change = firstPartyChangeFrom("sso=1; Domain=.corp.example; Secure", SIGN_IN, NOW);
    expect(change).toMatchObject({ kind: "write", cookie: { domain: "corp.example" } });
  });

  test("without a Path, the cookie belongs to the directory of the request", () => {
    expect(firstPartyChangeFrom("a=1", SIGN_IN, NOW)).toMatchObject({
      cookie: { path: "/auth", url: "https://app.corp.example:8443/auth" },
    });
  });

  test("an expired cookie signs out: it is removed", () => {
    expect(firstPartyChangeFrom("sid=; Path=/; Max-Age=0", SIGN_IN, NOW)).toEqual({
      kind: "remove",
      cookie: { url: "https://app.corp.example:8443/", name: "sid" },
    });
    expect(
      firstPartyChangeFrom("sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT", SIGN_IN, NOW),
    ).toMatchObject({ kind: "remove" });
  });

  test("Max-Age wins over Expires", () => {
    expect(
      firstPartyChangeFrom("a=1; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=10", SIGN_IN, NOW),
    ).toMatchObject({ kind: "write", cookie: { expirationDate: NOW + 10 } });
  });

  test("headers Chrome would reject, and partitioned cookies, are left to Chrome", () => {
    expect(firstPartyChangeFrom("a=1; Domain=other.example", SIGN_IN, NOW)).toBeNull();
    expect(firstPartyChangeFrom("no-value", SIGN_IN, NOW)).toBeNull();
    expect(firstPartyChangeFrom("=1", SIGN_IN, NOW)).toBeNull();
    expect(
      firstPartyChangeFrom("a=1; Secure; SameSite=None; Partitioned", SIGN_IN, NOW),
    ).toBeNull();
  });
});
