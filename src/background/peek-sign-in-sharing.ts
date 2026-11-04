import {
  type CookieChange,
  type CookieRemoval,
  type CookieWrite,
  type FirstPartyCookie,
  firstPartyChangeFrom,
} from "./cookie-writes.ts";
import {
  awaitingPeekWindow,
  copiesToTakeBack,
  type FrameNavigation,
  frameNavigating,
  isLentTo,
  type LentCookie,
  lentCopiesOf,
  lentCopyOf,
  mayWriteBackFrom,
  type PeekSignIn,
  partitionOfPeekedPages,
  reloaded,
  reloadingOnceLoaded,
  visiting,
  withLent,
  withoutLent,
  withPeekWindow,
} from "./peek-sign-in.ts";

export type PeekSignInPorts = {
  readonly topLevelSiteOf: (tabId: number) => Promise<string>;
  /** First-party cookies that would be sent to `host` or its subdomains. */
  readonly firstPartyCookiesFor: (host: string) => Promise<readonly FirstPartyCookie[]>;
  readonly writeCookie: (cookie: CookieWrite) => Promise<void>;
  readonly removeFirstPartyCookie: (cookie: CookieRemoval) => Promise<void>;
  readonly takeBackLentCookie: (lent: LentCookie) => Promise<void>;
  /** Open Peeks outlive the service worker, which Chrome stops when idle, and survive crashes. */
  readonly loadOpenPeeks: () => Promise<readonly PeekSignIn[]>;
  readonly saveOpenPeeks: (peeks: readonly PeekSignIn[]) => Promise<void>;
  readonly nowSeconds: () => number;
};

export type SetCookieResponse = {
  readonly tabId: number;
  readonly frameId: number;
  readonly url: URL;
  /** A document response redirecting its frame elsewhere. */
  readonly redirectsFrame: boolean;
  readonly setCookieHeaders: readonly string[];
};

export type PeekSignInSharing = ReturnType<typeof createPeekSignInSharing>;

/**
 * Carries out the Peek's sign-in sharing (see peek-sign-in.ts) as browser events arrive. Events are
 * handled one at a time, in order, because each one reads and updates the open Peeks.
 */
export function createPeekSignInSharing(ports: PeekSignInPorts) {
  let openPeeks: Promise<readonly PeekSignIn[]> | null = null;
  let queue: Promise<void> = Promise.resolve();

  const update = (
    change: (peeks: readonly PeekSignIn[]) => Promise<readonly PeekSignIn[]>,
  ): Promise<void> => {
    const run = async (): Promise<void> => {
      openPeeks ??= ports.loadOpenPeeks();
      const before = await openPeeks;
      const after = await change(before);
      openPeeks = Promise.resolve(after);
      if (after !== before) await ports.saveOpenPeeks(after);
    };
    const done = queue.then(run);
    queue = done.catch(() => {});
    return done;
  };

  const updatePeekIn = (
    tabId: number,
    change: (peek: PeekSignIn, others: readonly PeekSignIn[]) => Promise<PeekSignIn | null>,
  ): Promise<void> =>
    update(async (peeks) => {
      const peek = peeks.find((candidate) => candidate.tabId === tabId);
      if (!peek) return peeks;
      const others = peeks.filter((candidate) => candidate !== peek);
      const changed = await change(peek, others);
      if (changed === peek) return peeks;
      return changed ? [...others, changed] : others;
    });

  const lendCookiesOf = async (peek: PeekSignIn, host: string): Promise<PeekSignIn> => {
    if (!peek.peekWindow) return peek;
    let lending = peek;
    for (const cookie of await ports.firstPartyCookiesFor(host)) {
      const { copy, lent } = lentCopyOf(cookie, peek.peekWindow.partition);
      await ports.writeCookie(copy);
      lending = withLent(lending, lent);
    }
    return lending;
  };

  /** A removed cookie's copies go too; copies of written ones are lent with the rest of the site's. */
  const applyFirstParty = async (peek: PeekSignIn, change: CookieChange): Promise<PeekSignIn> => {
    if (change.kind === "write") {
      await ports.writeCookie(change.cookie);
      return peek;
    }
    await ports.removeFirstPartyCookie(change.cookie);
    let returning = peek;
    for (const lent of lentCopiesOf(peek, change.cookie)) {
      await ports.takeBackLentCookie(lent);
      returning = withoutLent(returning, lent);
    }
    return returning;
  };

  const takeBackAll = async (peek: PeekSignIn, stillOpen: readonly PeekSignIn[]): Promise<void> => {
    for (const lent of copiesToTakeBack(peek, stillOpen)) await ports.takeBackLentCookie(lent);
  };

  return {
    /** The page behind may now show a Peek; sharing starts once its Peek window introduces itself. */
    peekOpening: (tabId: number): Promise<void> =>
      update(async (peeks) => {
        const previous = peeks.find((peek) => peek.tabId === tabId);
        const others = peeks.filter((peek) => peek !== previous);
        if (previous) await takeBackAll(previous, others);
        return [...others, awaitingPeekWindow(tabId)];
      }),

    /** Before the Peek window loads `url`, so the first page arrives signed in. */
    peekWindowOpened: (tabId: number, frameId: number, url: URL): Promise<void> =>
      updatePeekIn(tabId, async (peek) => {
        if (peek.peekWindow) return peek;
        const partition = partitionOfPeekedPages(await ports.topLevelSiteOf(tabId));
        const visited = visiting(withPeekWindow(peek, { frameId, partition }), url);
        return visited.newlyVisitedHost
          ? lendCookiesOf(visited.peek, visited.newlyVisitedHost)
          : visited.peek;
      }),

    frameNavigating: (tabId: number, navigation: FrameNavigation): Promise<void> =>
      updatePeekIn(tabId, async (peek) => {
        const navigated = frameNavigating(peek, navigation);
        if (!navigated) return peek;
        return navigated.newlyVisitedHost
          ? lendCookiesOf(navigated.peek, navigated.newlyVisitedHost)
          : navigated.peek;
      }),

    /** Cookies a visited site sets in the Peek sign the user in (or out) everywhere, like in a tab. */
    responseReceived: (response: SetCookieResponse): Promise<void> =>
      updatePeekIn(response.tabId, async (peek) => {
        if (!mayWriteBackFrom(peek, response.frameId, response.url.hostname)) return peek;
        const changes = response.setCookieHeaders
          .map((header) => firstPartyChangeFrom(header, response.url, ports.nowSeconds()))
          .filter((change): change is CookieChange => change !== null);
        if (changes.length === 0) return peek;
        let lending = peek;
        for (const change of changes) lending = await applyFirstParty(lending, change);
        // Lent here rather than when Chrome reports the change, so a reload (below) sees them.
        lending = await lendCookiesOf(lending, response.url.hostname);
        return response.redirectsFrame ? reloadingOnceLoaded(lending, response.frameId) : lending;
      }),

    /** Queued behind the redirect's response, so a page it led to is never missed. */
    peekedPageLoaded: async (tabId: number, frameId: number): Promise<boolean> => {
      let mustReload = false;
      await updatePeekIn(tabId, async (peek) => {
        mustReload = peek.framesToReload.includes(frameId);
        return mustReload ? reloaded(peek, frameId) : peek;
      });
      return mustReload;
    },

    /** Keeps lent copies in step with the real cookies, however those changed. */
    firstPartyCookieChanged: (cookie: FirstPartyCookie, removed: boolean): Promise<void> =>
      update(async (peeks) => {
        const updated: PeekSignIn[] = [];
        for (const peek of peeks) {
          if (!(peek.peekWindow && isLentTo(peek, cookie))) {
            updated.push(peek);
            continue;
          }
          const { copy, lent } = lentCopyOf(cookie, peek.peekWindow.partition);
          if (removed) {
            await ports.takeBackLentCookie(lent);
            updated.push(withoutLent(peek, lent));
          } else {
            await ports.writeCookie(copy);
            updated.push(withLent(peek, lent));
          }
        }
        return updated;
      }),

    peekClosed: (tabId: number): Promise<void> =>
      updatePeekIn(tabId, async (peek, others) => {
        await takeBackAll(peek, others);
        return null;
      }),

    /** After a browser or extension restart no Peek is open; copies left by a crash are taken back. */
    forgetAllPeeks: (): Promise<void> =>
      update(async (peeks) => {
        for (const peek of peeks) await takeBackAll(peek, []);
        return [];
      }),
  };
}
