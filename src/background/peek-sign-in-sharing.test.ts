import { describe, expect, test } from "bun:test";
import type { CookieWrite, FirstPartyCookie } from "./cookie-writes.ts";
import type { LentCookie, PeekSignIn } from "./peek-sign-in.ts";
import { createPeekSignInSharing, type PeekSignInPorts } from "./peek-sign-in-sharing.ts";

const TAB = 7;
const PEEK_WINDOW_FRAME = 4;
const PEEKED_FRAME = 5;
const WIKI = new URL("https://wiki.corp.example/page");

/** A tiny cookie jar: first-party cookies by name, lent copies by name. */
function fakeBrowser(initial: readonly FirstPartyCookie[] = []) {
  const firstParty = new Map(initial.map((cookie) => [cookie.name, cookie]));
  const lent = new Map<string, CookieWrite>();
  let stored: readonly PeekSignIn[] = [];
  const ports: PeekSignInPorts = {
    topLevelSiteOf: async () => "https://news.example",
    firstPartyCookiesFor: async () => [...firstParty.values()],
    writeCookie: async (cookie) => {
      if (cookie.partition) {
        lent.set(cookie.name, cookie);
        return;
      }
      firstParty.set(cookie.name, {
        name: cookie.name,
        value: cookie.value,
        domain: new URL(cookie.url).hostname,
        hostOnly: true,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
      });
    },
    removeFirstPartyCookie: async (cookie) => {
      firstParty.delete(cookie.name);
    },
    takeBackLentCookie: async (cookie: LentCookie) => {
      lent.delete(cookie.name);
    },
    loadOpenPeeks: async () => stored,
    saveOpenPeeks: async (peeks) => {
      stored = peeks;
    },
    nowSeconds: () => 1_800_000_000,
  };
  return { ports, firstParty, lent, stored: () => stored };
}

const SIGNED_IN: FirstPartyCookie = {
  name: "sid",
  value: "alice",
  domain: "wiki.corp.example",
  hostOnly: true,
  path: "/",
  secure: true,
  httpOnly: true,
  sameSite: "lax",
};

async function openPeekAt(sharing: ReturnType<typeof createPeekSignInSharing>): Promise<void> {
  await sharing.peekOpening(TAB);
  await sharing.peekWindowOpened(TAB, PEEK_WINDOW_FRAME, WIKI);
  await sharing.frameNavigating(TAB, {
    frameId: PEEKED_FRAME,
    parentFrameId: PEEK_WINDOW_FRAME,
    url: WIKI,
  });
}

describe("sharing the user's sign-in with a peek", () => {
  test("the peeked site's cookies are lent before its first page loads, and taken back on close", async () => {
    const browser = fakeBrowser([SIGNED_IN]);
    const sharing = createPeekSignInSharing(browser.ports);

    await sharing.peekOpening(TAB);
    await sharing.peekWindowOpened(TAB, PEEK_WINDOW_FRAME, WIKI);
    expect([...browser.lent.keys()]).toEqual(["sid"]);

    await sharing.peekClosed(TAB);
    expect(browser.lent.size).toBe(0);
    expect(browser.firstParty.has("sid")).toBe(true);
    expect(browser.stored()).toEqual([]);
  });

  test("signing in inside the peek signs in for real, and reloads the page the redirect led to", async () => {
    const browser = fakeBrowser();
    const sharing = createPeekSignInSharing(browser.ports);
    await openPeekAt(sharing);

    const signedIn = sharing.responseReceived({
      tabId: TAB,
      frameId: PEEKED_FRAME,
      url: new URL("https://wiki.corp.example/sign-in"),
      redirectsFrame: true,
      setCookieHeaders: ["sid=alice; Path=/; Secure; HttpOnly; SameSite=Lax"],
    });
    const mustReload = sharing.peekedPageLoaded(TAB, PEEKED_FRAME);
    await signedIn;

    expect(await mustReload).toBe(true);
    expect(browser.firstParty.get("sid")?.value).toBe("alice");
    expect(browser.lent.get("sid")?.value).toBe("alice");
    expect(await sharing.peekedPageLoaded(TAB, PEEKED_FRAME)).toBe(false);
  });

  test("signing out inside the peek signs out for real and takes the copy back", async () => {
    const browser = fakeBrowser([SIGNED_IN]);
    const sharing = createPeekSignInSharing(browser.ports);
    await openPeekAt(sharing);

    await sharing.responseReceived({
      tabId: TAB,
      frameId: PEEKED_FRAME,
      url: new URL("https://wiki.corp.example/sign-out"),
      redirectsFrame: true,
      setCookieHeaders: ["sid=; Path=/; Max-Age=0"],
    });

    expect(browser.firstParty.has("sid")).toBe(false);
    expect(browser.lent.has("sid")).toBe(false);
  });

  test("cookies set for frames outside the peek are left to Chrome", async () => {
    const browser = fakeBrowser();
    const sharing = createPeekSignInSharing(browser.ports);
    await openPeekAt(sharing);

    await sharing.responseReceived({
      tabId: TAB,
      frameId: 3,
      url: new URL("https://wiki.corp.example/embed"),
      redirectsFrame: false,
      setCookieHeaders: ["tracker=1; Secure; SameSite=None"],
    });

    expect(browser.firstParty.size).toBe(0);
  });

  test("after a restart, copies a crashed browser left behind are taken back", async () => {
    const browser = fakeBrowser([SIGNED_IN]);
    await openPeekAt(createPeekSignInSharing(browser.ports));

    await createPeekSignInSharing(browser.ports).forgetAllPeeks();

    expect(browser.lent.size).toBe(0);
    expect(browser.stored()).toEqual([]);
  });
});
