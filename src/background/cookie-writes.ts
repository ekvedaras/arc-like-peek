/**
 * Cookies as the Peek's sign-in sharing reads and writes them, independent of chrome.cookies.
 * Times are seconds since the epoch, like Chrome's `expirationDate`.
 */

/** A cookie partition: cookies in it are only sent from frames under this top-level site. */
export type CookiePartition = {
  readonly topLevelSite: string;
  readonly hasCrossSiteAncestor: boolean;
};

export type CookieSameSite = "no_restriction" | "lax" | "strict" | "unspecified";

/** A cookie in the browser's ordinary, unpartitioned store: what a normal tab signs in with. */
export type FirstPartyCookie = {
  readonly name: string;
  readonly value: string;
  /** With a leading dot when the cookie is shared with subdomains (`hostOnly: false`). */
  readonly domain: string;
  readonly hostOnly: boolean;
  readonly path: string;
  readonly secure: boolean;
  readonly httpOnly: boolean;
  readonly sameSite: CookieSameSite;
};

export type CookieWrite = {
  /** The address the cookie belongs to; Chrome checks it against domain, path and `secure`. */
  readonly url: string;
  readonly name: string;
  readonly value: string;
  /** Absent for host-only cookies. */
  readonly domain?: string;
  readonly path: string;
  readonly secure: boolean;
  readonly httpOnly: boolean;
  readonly sameSite: CookieSameSite;
  /** Absent for cookies that end with the browser session. */
  readonly expirationDate?: number;
  /** Absent for first-party cookies. */
  readonly partition?: CookiePartition;
};

/** Removes a first-party cookie; partitioned copies of it are left alone. */
export type CookieRemoval = {
  readonly url: string;
  readonly name: string;
};

export type CookieChange =
  | { readonly kind: "write"; readonly cookie: CookieWrite }
  | { readonly kind: "remove"; readonly cookie: CookieRemoval };

/**
 * What a `Set-Cookie` response header asks the browser to store, as a first-party cookie of the
 * response's site. Null for headers Chrome would reject, and for `Partitioned` cookies, which the
 * site wants kept in the partition Chrome already stores them in.
 */
export function firstPartyChangeFrom(
  header: string,
  responseUrl: URL,
  nowSeconds: number,
): CookieChange | null {
  const [pair = "", ...attributeParts] = header.split(";");
  const separator = pair.indexOf("=");
  if (separator <= 0) return null;
  const name = pair.slice(0, separator).trim();
  const value = pair.slice(separator + 1).trim();
  if (name === "") return null;

  const attributes = new Map(
    attributeParts.map((part) => {
      const [key = "", ...rest] = part.split("=");
      return [key.trim().toLowerCase(), rest.join("=").trim()] as const;
    }),
  );
  if (attributes.has("partitioned")) return null;

  const host = responseUrl.hostname;
  const domain = domainAttributeOf(attributes.get("domain"));
  if (domain !== null && !isDomainOrSubdomainOf(host, domain)) return null;
  const path = pathAttributeOf(attributes.get("path"), responseUrl);
  const url = `${responseUrl.origin}${path}`;

  const expirationDate = expirationOf(attributes, nowSeconds);
  if (expirationDate !== null && expirationDate <= nowSeconds) {
    return { kind: "remove", cookie: { url, name } };
  }
  return {
    kind: "write",
    cookie: {
      url,
      name,
      value,
      ...(domain !== null && { domain }),
      path,
      secure: attributes.has("secure"),
      httpOnly: attributes.has("httponly"),
      sameSite: sameSiteOf(attributes.get("samesite")),
      ...(expirationDate !== null && { expirationDate }),
    },
  };
}

/** True when `host` is `domain` itself or one of its subdomains. */
export function isDomainOrSubdomainOf(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function domainAttributeOf(attribute: string | undefined): string | null {
  const domain = attribute?.replace(/^\./, "").toLowerCase();
  return domain ? domain : null;
}

/** RFC 6265 §5.1.4: without a Path attribute, the directory of the request path. */
function pathAttributeOf(attribute: string | undefined, responseUrl: URL): string {
  if (attribute?.startsWith("/")) return attribute;
  const directoryEnd = responseUrl.pathname.lastIndexOf("/");
  return directoryEnd > 0 ? responseUrl.pathname.slice(0, directoryEnd) : "/";
}

/** Max-Age wins over Expires (RFC 6265 §5.3). */
function expirationOf(attributes: ReadonlyMap<string, string>, nowSeconds: number): number | null {
  const maxAge = attributes.get("max-age");
  if (maxAge !== undefined && /^-?\d+$/.test(maxAge)) return nowSeconds + Number(maxAge);
  const expires = attributes.get("expires");
  if (expires === undefined) return null;
  const expiresMs = Date.parse(expires);
  return Number.isNaN(expiresMs) ? null : Math.floor(expiresMs / 1000);
}

function sameSiteOf(attribute: string | undefined): CookieSameSite {
  switch (attribute?.toLowerCase()) {
    case "none":
      return "no_restriction";
    case "lax":
      return "lax";
    case "strict":
      return "strict";
    default:
      return "unspecified";
  }
}
