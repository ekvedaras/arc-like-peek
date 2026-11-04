import { describe, expect, test } from "bun:test";
import type { FirstPartyCookie } from "./cookie-writes.ts";
import {
  awaitingPeekWindow,
  copiesToTakeBack,
  frameNavigating,
  isLentTo,
  lentCopyOf,
  mayWriteBackFrom,
  type PeekSignIn,
  partitionOfPeekedPages,
  visiting,
  withLent,
  withPeekWindow,
} from "./peek-sign-in.ts";

const PARTITION = partitionOfPeekedPages("https://news.example");
const PEEK_WINDOW_FRAME = 4;
const PEEKED_FRAME = 5;

function openPeek(): PeekSignIn {
  return withPeekWindow(awaitingPeekWindow(7), {
    frameId: PEEK_WINDOW_FRAME,
    partition: PARTITION,
  });
}

function navigated(peek: PeekSignIn, frameId: number, parentFrameId: number, url: string) {
  const result = frameNavigating(peek, { frameId, parentFrameId, url: new URL(url) });
  if (!result) throw new Error("Not a frame of the peek");
  return result;
}

function cookie(overrides: Partial<FirstPartyCookie>): FirstPartyCookie {
  return {
    name: "sid",
    value: "alice",
    domain: "wiki.corp.example",
    hostOnly: true,
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "lax",
    ...overrides,
  };
}

describe("which frames and sites belong to a peek", () => {
  test("pages loaded in the peek's own frame are sites the user visits", () => {
    const { peek, newlyVisitedHost } = navigated(
      openPeek(),
      PEEKED_FRAME,
      PEEK_WINDOW_FRAME,
      "https://wiki.corp.example/page",
    );

    expect(newlyVisitedHost).toBe("wiki.corp.example");
    expect(peek.frameIds).toEqual([PEEKED_FRAME]);
  });

  test("frames nested in the peeked page are part of the peek, but their sites are not visited", () => {
    const { peek } = navigated(
      openPeek(),
      PEEKED_FRAME,
      PEEK_WINDOW_FRAME,
      "https://wiki.corp.example/",
    );

    const nested = navigated(peek, 9, PEEKED_FRAME, "https://bank.example/widget");

    expect(nested.newlyVisitedHost).toBeNull();
    expect(nested.peek.frameIds).toEqual([PEEKED_FRAME, 9]);
    expect(nested.peek.visitedHosts).toEqual(["wiki.corp.example"]);
  });

  test("frames of the page behind the peek are none of its business", () => {
    expect(
      frameNavigating(openPeek(), {
        frameId: 3,
        parentFrameId: 0,
        url: new URL("https://ad.example"),
      }),
    ).toBeNull();
    expect(
      frameNavigating(awaitingPeekWindow(7), {
        frameId: 3,
        parentFrameId: PEEK_WINDOW_FRAME,
        url: new URL("https://wiki.corp.example"),
      }),
    ).toBeNull();
  });
});

describe("what a peek may sign in with and write back", () => {
  const visited = visiting(
    navigated(openPeek(), PEEKED_FRAME, PEEK_WINDOW_FRAME, "https://wiki.corp.example/").peek,
    new URL("https://wiki.corp.example/"),
  ).peek;

  test("cookies sent to a visited site are lent, cookies of other sites are not", () => {
    expect(isLentTo(visited, cookie({}))).toBe(true);
    expect(isLentTo(visited, cookie({ domain: ".corp.example", hostOnly: false }))).toBe(true);
    expect(isLentTo(visited, cookie({ domain: "api.wiki.corp.example" }))).toBe(true);
    expect(isLentTo(visited, cookie({ domain: "mail.corp.example" }))).toBe(false);
    expect(isLentTo(visited, cookie({ domain: "bank.example" }))).toBe(false);
  });

  test("only responses to the peek's frames from visited sites may sign the user in", () => {
    expect(mayWriteBackFrom(visited, PEEKED_FRAME, "wiki.corp.example")).toBe(true);
    expect(mayWriteBackFrom(visited, PEEKED_FRAME, "bank.example")).toBe(false);
    expect(mayWriteBackFrom(visited, 3, "wiki.corp.example")).toBe(false);
  });

  test("a lent copy is partitioned under the page behind, Secure and SameSite=None", () => {
    expect(lentCopyOf(cookie({ domain: ".corp.example", hostOnly: false }), PARTITION)).toEqual({
      copy: {
        url: "https://corp.example/",
        name: "sid",
        value: "alice",
        domain: ".corp.example",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "no_restriction",
        partition: { topLevelSite: "https://news.example", hasCrossSiteAncestor: true },
      },
      lent: {
        url: "https://corp.example/",
        name: "sid",
        domain: ".corp.example",
        path: "/",
        partition: { topLevelSite: "https://news.example", hasCrossSiteAncestor: true },
      },
    });
  });

  test("copies another open peek still uses are not taken back", () => {
    const { lent: shared } = lentCopyOf(cookie({}), PARTITION);
    const { lent: own } = lentCopyOf(cookie({ name: "pref" }), PARTITION);
    const closing = withLent(withLent(visited, shared), own);
    const other = withLent({ ...openPeek(), tabId: 8 }, shared);

    expect(copiesToTakeBack(closing, [other])).toEqual([own]);
    expect(copiesToTakeBack(closing, [])).toEqual([shared, own]);
  });
});
