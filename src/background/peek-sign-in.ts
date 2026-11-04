import {
  type CookiePartition,
  type CookieRemoval,
  type CookieWrite,
  type FirstPartyCookie,
  isDomainOrSubdomainOf,
} from "./cookie-writes.ts";

/**
 * How a Peek carries the user's sign-in. Chrome treats the peeked page as a cross-site frame of the
 * page behind the Peek, so it withholds its SameSite cookies (and, when third-party cookies are
 * blocked, all of them). While the Peek is open, the first-party cookies of the sites the user visits
 * in it are lent to it as partitioned copies, and cookies those sites set in it are written back as
 * first-party cookies. See wiki/decisions/2026-11-04-signed-in-peek.md.
 */
export type PeekSignIn = {
  readonly tabId: number;
  /** Null until the Peek window, the extension page holding the peeked page, has introduced itself. */
  readonly peekWindow: PeekWindow | null;
  /** The peeked page's frame and every frame nested in it. */
  readonly frameIds: readonly number[];
  /** Hosts of pages the user visited in the Peek's own frame. Only their cookies are lent. */
  readonly visitedHosts: readonly string[];
  /**
   * Frames whose page was requested before the cookies set by the redirect to it were in place.
   * Chrome follows a redirect without waiting for extensions, so the page arrives signed out.
   */
  readonly framesToReload: readonly number[];
  /** Every copy lent to the Peek, so closing it leaves nothing behind. */
  readonly lentCookies: readonly LentCookie[];
};

/** A copy lent to a Peek, identified the way Chrome tells cookies apart. */
export type LentCookie = {
  readonly url: string;
  readonly name: string;
  /** Absent for host-only cookies. */
  readonly domain?: string;
  readonly path: string;
  readonly partition: CookiePartition;
};

export type PeekWindow = {
  readonly frameId: number;
  /** The partition the peeked page's cookies live in: the page behind the Peek's site. */
  readonly partition: CookiePartition;
};

export type FrameNavigation = {
  readonly frameId: number;
  readonly parentFrameId: number;
  readonly url: URL;
};

/**
 * Where the peeked page's cookies live: under the page behind the Peek, below a cross-site frame
 * (the Peek window is an extension page, cross-site to every web page), whatever the peeked site.
 */
export function partitionOfPeekedPages(topLevelSite: string): CookiePartition {
  return { topLevelSite, hasCrossSiteAncestor: true };
}

export function awaitingPeekWindow(tabId: number): PeekSignIn {
  return {
    tabId,
    peekWindow: null,
    frameIds: [],
    visitedHosts: [],
    framesToReload: [],
    lentCookies: [],
  };
}

export function withPeekWindow(peek: PeekSignIn, peekWindow: PeekWindow): PeekSignIn {
  return { ...peek, peekWindow };
}

/**
 * A frame in the tab starts loading a page. Frames outside the Peek are none of its business. A page
 * in the Peek's own frame is a site the user visits, like in a tab; pages nested in it are not, just
 * as a tab does not sign a page's embeds in with the embedded site's SameSite cookies.
 */
export function frameNavigating(
  peek: PeekSignIn,
  navigation: FrameNavigation,
): { readonly peek: PeekSignIn; readonly newlyVisitedHost: string | null } | null {
  const { peekWindow } = peek;
  if (!peekWindow) return null;
  const isPeekedPage = navigation.parentFrameId === peekWindow.frameId;
  if (!(isPeekedPage || peek.frameIds.includes(navigation.parentFrameId))) return null;

  const frameIds = peek.frameIds.includes(navigation.frameId)
    ? peek.frameIds
    : [...peek.frameIds, navigation.frameId];
  const inFrames = { ...peek, frameIds };
  return isPeekedPage
    ? visiting(inFrames, navigation.url)
    : { peek: inFrames, newlyVisitedHost: null };
}

/** The user visits `url` in the Peek's own frame. */
export function visiting(
  peek: PeekSignIn,
  url: URL,
): { readonly peek: PeekSignIn; readonly newlyVisitedHost: string | null } {
  const host = url.hostname;
  if (peek.visitedHosts.includes(host)) return { peek, newlyVisitedHost: null };
  return { peek: { ...peek, visitedHosts: [...peek.visitedHosts, host] }, newlyVisitedHost: host };
}

/** Whether a response to this frame, from this host, may sign the user in (or out) for real. */
export function mayWriteBackFrom(peek: PeekSignIn, frameId: number, host: string): boolean {
  return (
    peek.frameIds.includes(frameId) &&
    peek.visitedHosts.some((visited) => isDomainOrSubdomainOf(host, visited))
  );
}

/** Whether a first-party cookie would be sent to one of the sites visited in the Peek. */
export function isLentTo(peek: PeekSignIn, cookie: FirstPartyCookie): boolean {
  const domain = cookie.domain.replace(/^\./, "");
  return peek.visitedHosts.some((visited) =>
    cookie.hostOnly
      ? isDomainOrSubdomainOf(domain, visited)
      : isDomainOrSubdomainOf(visited, domain) || isDomainOrSubdomainOf(domain, visited),
  );
}

/**
 * The copy a Peek borrows. Partitioned cookies must be `Secure` and `SameSite=None`; partitioned,
 * they are sent cross-site even when third-party cookies are blocked. It lasts for the browser
 * session at most, and is taken back when the Peek closes.
 */
export function lentCopyOf(
  cookie: FirstPartyCookie,
  partition: CookiePartition,
): { readonly copy: CookieWrite; readonly lent: LentCookie } {
  const host = cookie.domain.replace(/^\./, "");
  const lent: LentCookie = {
    url: `https://${host}${cookie.path}`,
    name: cookie.name,
    ...(!cookie.hostOnly && { domain: cookie.domain }),
    path: cookie.path,
    partition,
  };
  return {
    copy: {
      ...lent,
      value: cookie.value,
      secure: true,
      httpOnly: cookie.httpOnly,
      sameSite: "no_restriction",
    },
    lent,
  };
}

/** Copies lent to the Peek that stand for the first-party cookie being removed. */
export function lentCopiesOf(peek: PeekSignIn, removal: CookieRemoval): readonly LentCookie[] {
  const host = new URL(removal.url).hostname;
  return peek.lentCookies.filter(
    (lent) => lent.name === removal.name && isDomainOrSubdomainOf(host, new URL(lent.url).hostname),
  );
}

export function reloadingOnceLoaded(peek: PeekSignIn, frameId: number): PeekSignIn {
  return peek.framesToReload.includes(frameId)
    ? peek
    : { ...peek, framesToReload: [...peek.framesToReload, frameId] };
}

export function reloaded(peek: PeekSignIn, frameId: number): PeekSignIn {
  return { ...peek, framesToReload: peek.framesToReload.filter((frame) => frame !== frameId) };
}

export function withLent(peek: PeekSignIn, lent: LentCookie): PeekSignIn {
  const others = peek.lentCookies.filter((other) => !isSameCookie(other, lent));
  return { ...peek, lentCookies: [...others, lent] };
}

export function withoutLent(peek: PeekSignIn, lent: LentCookie): PeekSignIn {
  return { ...peek, lentCookies: peek.lentCookies.filter((other) => !isSameCookie(other, lent)) };
}

/**
 * Copies to take back when a Peek closes. Peeks in other tabs behind pages of the same site share
 * the partition, so copies they still use stay until they close too.
 */
export function copiesToTakeBack(
  closing: PeekSignIn,
  stillOpen: readonly PeekSignIn[],
): readonly LentCookie[] {
  return closing.lentCookies.filter(
    (lent) =>
      !stillOpen.some((peek) => peek.lentCookies.some((other) => isSameCookie(lent, other))),
  );
}

function isSameCookie(a: LentCookie, b: LentCookie): boolean {
  return (
    a.name === b.name &&
    a.domain === b.domain &&
    a.url === b.url &&
    a.path === b.path &&
    a.partition.topLevelSite === b.partition.topLevelSite &&
    a.partition.hasCrossSiteAncestor === b.partition.hasCrossSiteAncestor
  );
}
