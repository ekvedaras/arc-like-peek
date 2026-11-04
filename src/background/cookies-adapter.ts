import type { CookieRemoval, CookieWrite, FirstPartyCookie } from "./cookie-writes.ts";
import type { LentCookie } from "./peek-sign-in.ts";

/** Any time in the past; one second after the epoch. */
const EXPIRED = 1;

/** The site the tab's top-level page belongs to, as Chrome keys cookie partitions. */
export async function topLevelSiteOf(tabId: number): Promise<string> {
  const { partitionKey } = await chrome.cookies.getPartitionKey({ tabId, frameId: 0 });
  if (partitionKey.topLevelSite === undefined) throw new Error(`Tab ${tabId} has no site`);
  return partitionKey.topLevelSite;
}

/** Without a partition key, chrome.cookies only returns unpartitioned (first-party) cookies. */
export async function firstPartyCookiesFor(host: string): Promise<readonly FirstPartyCookie[]> {
  const [onHostAndSubdomains, sentToHost] = await Promise.all([
    chrome.cookies.getAll({ domain: host }),
    chrome.cookies.getAll({ url: `https://${host}/` }),
  ]);
  const unique = new Map<string, FirstPartyCookie>();
  for (const cookie of [...onHostAndSubdomains, ...sentToHost]) {
    unique.set(`${cookie.domain};${cookie.path};${cookie.name}`, firstPartyCookieOf(cookie));
  }
  return [...unique.values()];
}

export async function writeCookie(cookie: CookieWrite): Promise<void> {
  const { partition, ...details } = cookie;
  const written = await chrome.cookies.set({
    ...details,
    ...(partition && { partitionKey: partition }),
  });
  if (!written) throw new Error(`Chrome refused cookie ${cookie.name} for ${cookie.url}`);
}

/** Without a partition key, chrome.cookies.remove only removes the first-party cookie. */
export async function removeFirstPartyCookie(cookie: CookieRemoval): Promise<void> {
  await chrome.cookies.remove({ url: cookie.url, name: cookie.name });
}

/**
 * Expires the copy instead of removing it: chrome.cookies.remove with a partition key also deletes
 * the first-party cookie of the same name, which would sign the user out (Chrome 153, 2026-11-04).
 */
export async function takeBackLentCookie(lent: LentCookie): Promise<void> {
  const { partition, ...identity } = lent;
  await chrome.cookies.set({
    ...identity,
    value: "",
    secure: true,
    sameSite: "no_restriction",
    partitionKey: partition,
    expirationDate: EXPIRED,
  });
}

/** Partitioned cookies are skipped: the Peek's own copies change there, and sites' CHIPS cookies. */
export function onFirstPartyCookieChanged(
  listener: (cookie: FirstPartyCookie, removed: boolean) => void,
): void {
  chrome.cookies.onChanged.addListener(({ cookie, removed }) => {
    if (cookie.partitionKey === undefined) listener(firstPartyCookieOf(cookie), removed);
  });
}

function firstPartyCookieOf(cookie: chrome.cookies.Cookie): FirstPartyCookie {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    hostOnly: cookie.hostOnly,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
  };
}
