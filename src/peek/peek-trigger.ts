/** An absolute http(s) URL that may be shown in a Peek. */
export type PeekableUrl = string & { readonly kind: "PeekableUrl" };

export type PointerGesture = {
  readonly button: number;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
};

export type LinkActivation = {
  readonly href: string;
  readonly hasDownloadAttribute: boolean;
  readonly pageUrl: string;
};

/** Meeting links never open in Peek in Arc, so a Peek can't be closed with the call in it. */
const MEETING_HOSTS = ["meet.google.com", "zoom.us", "teams.microsoft.com", "whereby.com"];

export function isPeekGesture(gesture: PointerGesture): boolean {
  return (
    gesture.button === 0 &&
    gesture.shiftKey &&
    !(gesture.altKey || gesture.ctrlKey || gesture.metaKey)
  );
}

export function peekableUrl(link: LinkActivation): PeekableUrl | null {
  if (link.hasDownloadAttribute) return null;

  const url = parseUrl(link.href, link.pageUrl);
  if (!url) return null;
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (isSameDocument(url, link.pageUrl)) return null;
  if (isMeetingUrl(url)) return null;

  // Safe: checked above to be an absolute http(s) URL worth peeking.
  return url.href as PeekableUrl;
}

/** Re-validates a URL reported from elsewhere (e.g. the peeked frame) before it is trusted. */
export function asPeekableUrl(href: string): PeekableUrl | null {
  const url = parseUrl(href, undefined);
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) return null;
  // Safe: checked above to be an absolute http(s) URL.
  return url.href as PeekableUrl;
}

function parseUrl(href: string, base: string | undefined): URL | null {
  try {
    return new URL(href, base);
  } catch {
    return null;
  }
}

function isSameDocument(url: URL, pageUrl: string): boolean {
  const page = parseUrl(pageUrl, undefined);
  if (!page) return false;
  return url.hash !== "" && withoutHash(url) === withoutHash(page);
}

function withoutHash(url: URL): string {
  return url.href.slice(0, url.href.length - url.hash.length);
}

function isMeetingUrl(url: URL): boolean {
  return MEETING_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}
