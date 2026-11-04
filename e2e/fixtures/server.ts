import { join } from "node:path";

const PAGES_DIRECTORY = join(import.meta.dir, "pages");

const FRAMING_DENIED_HEADERS = {
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
};

const HEADERS_BY_PATH: Record<string, Record<string, string>> = {
  "/framing-denied.html": FRAMING_DENIED_HEADERS,
};

export type FixtureServer = {
  readonly origin: string;
  url(path: string): string;
  stop(): Promise<void>;
};

export function startFixtureServer(): FixtureServer {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const { pathname } = new URL(request.url);
      const page = Bun.file(join(PAGES_DIRECTORY, pathname === "/" ? "links.html" : pathname));
      if (pathname.includes("..") || !(await page.exists())) {
        return new Response("Not found", { status: 404 });
      }
      return new Response(page, { headers: HEADERS_BY_PATH[pathname] ?? {} });
    },
  });

  const origin = `http://127.0.0.1:${server.port}`;
  return {
    origin,
    url: (path) => new URL(path, origin).toString(),
    stop: () => server.stop(true),
  };
}

if (import.meta.main) {
  const server = startFixtureServer();
  console.log(`fixture server listening on ${server.origin}`);
}
