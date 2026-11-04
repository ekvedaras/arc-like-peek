import { join } from "node:path";

const PAGES_DIRECTORY = join(import.meta.dir, "pages");

/**
 * A second site served by the same server. The browser resolves it to 127.0.0.1 (see
 * CROSS_SITE_HOST_RESOLVER_RULE), so pages can link to a genuinely cross-site origin, like real Peeks do.
 */
export const CROSS_SITE_HOSTNAME = "peeked-site.test";
export const CROSS_SITE_HOST_RESOLVER_RULE = `MAP ${CROSS_SITE_HOSTNAME} 127.0.0.1`;

/** Written in fixture HTML where the cross-site origin (which has a random port) belongs. */
const CROSS_SITE_ORIGIN_PLACEHOLDER = "{{CROSS_SITE_ORIGIN}}";

const FRAMING_DENIED_HEADERS = {
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
};

/** Like sites such as GitHub: frames, styles and scripts restricted to the page's own origin. */
const STRICT_HOST_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; frame-src 'self'; style-src 'self'; script-src 'self'; require-trusted-types-for 'script'",
};

const HEADERS_BY_PATH: Record<string, Record<string, string>> = {
  "/framing-denied.html": FRAMING_DENIED_HEADERS,
  "/strict-host.html": STRICT_HOST_HEADERS,
};

export type FixtureServer = {
  readonly origin: string;
  readonly crossSiteOrigin: string;
  url(path: string): string;
  crossSiteUrl(path: string): string;
  stop(): Promise<void>;
};

export function startFixtureServer(): FixtureServer {
  let crossSiteOrigin = "";
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const { pathname, searchParams } = new URL(request.url);
      const respondAfterMs = Number(searchParams.get("respondAfterMs") ?? 0);
      if (respondAfterMs > 0) await Bun.sleep(respondAfterMs);
      const page = Bun.file(join(PAGES_DIRECTORY, pathname === "/" ? "links.html" : pathname));
      if (pathname.includes("..") || !(await page.exists())) {
        return new Response("Not found", { status: 404 });
      }
      const headers = HEADERS_BY_PATH[pathname] ?? {};
      if (pathname.endsWith(".html") || pathname === "/") {
        const html = (await page.text()).replaceAll(CROSS_SITE_ORIGIN_PLACEHOLDER, crossSiteOrigin);
        return new Response(html, { headers: { "Content-Type": "text/html", ...headers } });
      }
      return new Response(page, { headers });
    },
  });

  const origin = `http://127.0.0.1:${server.port}`;
  crossSiteOrigin = `http://${CROSS_SITE_HOSTNAME}:${server.port}`;
  return {
    origin,
    crossSiteOrigin,
    url: (path) => new URL(path, origin).toString(),
    crossSiteUrl: (path) => new URL(path, crossSiteOrigin).toString(),
    stop: () => server.stop(true),
  };
}

if (import.meta.main) {
  const server = startFixtureServer();
  console.log(`fixture server listening on ${server.origin}`);
}
