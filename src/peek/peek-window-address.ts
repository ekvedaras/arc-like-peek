import { asPeekableUrl, type PeekableUrl } from "./peek-trigger.ts";

/**
 * The extension page the Peek's frame shows; it hosts the peeked page in a frame of its own. Its
 * own CSP, not the CSP of the page being peeked from, then governs every navigation inside the Peek.
 * See wiki/decisions/2026-11-04-peek-window.md.
 */
export const PEEK_WINDOW_PAGE = "peek-window/peek-window.html";

const PEEKED_URL_PARAMETER = "url";

/** Where the Peek's frame goes to show `url`, given the extension URL of the Peek window page. */
export function peekWindowAddress(peekWindowPageUrl: string, url: PeekableUrl): string {
  const address = new URL(peekWindowPageUrl);
  address.searchParams.set(PEEKED_URL_PARAMETER, url);
  return address.href;
}

/** The page a Peek window was asked to show, or null when the address carries no peekable URL. */
export function peekedUrlFrom(address: string): PeekableUrl | null {
  const requested = new URL(address).searchParams.get(PEEKED_URL_PARAMETER);
  return requested === null ? null : asPeekableUrl(requested);
}

/**
 * The Peek window is a secure page, so Chrome blocks plain-http pages inside it as mixed content.
 * Like Chrome's own HTTPS-Upgrades for clicked links, ask for the https version instead, except where
 * an upgrade cannot work or is not needed: explicit ports (dev servers) and the local machine.
 */
export function framableUrl(url: PeekableUrl): PeekableUrl {
  const framable = new URL(url);
  if (framable.protocol !== "http:" || framable.port !== "" || isLocalHost(framable.hostname))
    return url;
  framable.protocol = "https:";
  // Safe: only the scheme changed, from http to https.
  return framable.href as PeekableUrl;
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1";
}
