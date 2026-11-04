import type { PeekableUrl } from "./peek-trigger.ts";

/**
 * Who frames the peeked page. A page on the site of the page behind the Peek is framed by that page
 * itself: with nothing cross-site above it, Chrome gives it its first-party cookies and storage, so
 * the user is signed in as in a tab. Any other page is framed by the Peek window, whose own CSP
 * (unlike the page behind's) lets it navigate anywhere. See wiki/decisions/2026-11-04-same-site-peek.md.
 */
export type PeekedPageFraming = "framedByPage" | "framedByPeekWindow";

export function peekedPageFraming(pageUrl: string, url: PeekableUrl): PeekedPageFraming {
  return isSameSiteGuess(new URL(pageUrl), new URL(url)) ? "framedByPage" : "framedByPeekWindow";
}

/**
 * Whether the peeked page, framed by the page behind, may go to `destination` without leaving the
 * site that page vouches for. Beyond it the page behind's CSP could block the frame.
 */
export function staysOnPageSite(pageOrigin: string, destination: PeekableUrl): boolean {
  return isSameSiteGuess(new URL(pageOrigin), new URL(destination));
}

/**
 * Chrome's site is the scheme plus the registrable domain, which needs the public suffix list. The
 * last two labels of the host never split one site in two, and calling two sites one (`a.co.uk`,
 * `b.co.uk`) only frames a cross-site page without the Peek window: signed out, as it would be
 * anyway, and navigating under the page behind's CSP.
 */
function isSameSiteGuess(a: URL, b: URL): boolean {
  return a.protocol === b.protocol && siteGuessOf(a.hostname) === siteGuessOf(b.hostname);
}

function siteGuessOf(hostname: string): string {
  if (hostname.startsWith("[") || /^\d+(\.\d+){3}$/.test(hostname)) return hostname;
  return hostname.split(".").slice(-2).join(".");
}
