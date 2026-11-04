import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * An internal web app the user signs in to, on a site of its own and over https like real intranets.
 * The browser resolves it to 127.0.0.1 (see INTRANET_HOST_RESOLVER_RULE) and accepts its self-signed
 * certificate. Each login kind keeps the session the way some real app does.
 */
export const INTRANET_HOSTNAME = "intranet.test";
export const INTRANET_HOST_RESOLVER_RULE = `MAP ${INTRANET_HOSTNAME} 127.0.0.1`;

export const INTRANET_LOGINS = [
  "lax-cookie",
  "strict-cookie",
  "none-cookie",
  "local-storage",
] as const;
export type IntranetLogin = (typeof INTRANET_LOGINS)[number];

const SESSION_COOKIE_ATTRIBUTES: Record<Exclude<IntranetLogin, "local-storage">, string> = {
  "lax-cookie": "SameSite=Lax",
  "strict-cookie": "SameSite=Strict",
  "none-cookie": "SameSite=None",
};

const STORAGE_TOKEN_KEY = "intranet-token";
const SIGNED_IN_USER = "alice";

export type IntranetApp = {
  readonly origin: string;
  /** The page that says whether the visitor is signed in, and offers to sign in or out. */
  accountUrl(login: IntranetLogin): string;
  stop(): Promise<void>;
};

export async function startIntranetApp(): Promise<IntranetApp> {
  const tls = await selfSignedCertificateFor(INTRANET_HOSTNAME);
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    tls,
    fetch(request) {
      const url = new URL(request.url);
      const login = loginKindOf(url.searchParams.get("login"));
      if (!login) return new Response("Unknown login kind", { status: 400 });
      switch (`${request.method} ${url.pathname}`) {
        case "GET /account":
          return accountPage(login, request);
        case "GET /api/session":
          return new Response(isSignedIn(login, request) ? "signed in" : "signed out", {
            headers: { "Content-Type": "text/plain" },
          });
        case "POST /sign-in":
          return changeSession(login, "signIn");
        case "POST /sign-out":
          return changeSession(login, "signOut");
        default:
          return new Response("Not found", { status: 404 });
      }
    },
  });
  const origin = `https://${INTRANET_HOSTNAME}:${server.port}`;
  return {
    origin,
    accountUrl: (login) => new URL(`/account?login=${login}`, origin).toString(),
    stop: () => server.stop(true),
  };
}

function loginKindOf(value: string | null): IntranetLogin | null {
  return INTRANET_LOGINS.find((login) => login === value) ?? null;
}

function sessionCookieName(login: IntranetLogin): string {
  return `intranet_${login.replace("-", "_")}`;
}

function changeSession(login: IntranetLogin, change: "signIn" | "signOut"): Response {
  const headers = new Headers([["Location", `/account?login=${login}`]]);
  if (login !== "local-storage") {
    const lifetime = change === "signIn" ? "Max-Age=3600" : "Max-Age=0";
    const value = change === "signIn" ? SIGNED_IN_USER : "";
    headers.append(
      "Set-Cookie",
      `${sessionCookieName(login)}=${value}; Path=/; Secure; HttpOnly; ${lifetime}; ${SESSION_COOKIE_ATTRIBUTES[login]}`,
    );
  }
  // 303: like most sign-in forms, the browser follows up with a GET of the account page.
  return new Response(null, { status: 303, headers });
}

function accountPage(login: IntranetLogin, request: Request): Response {
  const html = login === "local-storage" ? storageAccountPage() : cookieAccountPage(login, request);
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

function isSignedIn(login: IntranetLogin, request: Request): boolean {
  const cookies = new Bun.CookieMap(request.headers.get("Cookie") ?? "");
  return cookies.get(sessionCookieName(login)) === SIGNED_IN_USER;
}

/**
 * Says twice whether the visitor is signed in: as the server saw the page's own request, and as an
 * API call from the page sees it, like single-page apps that ask the server who is signed in.
 */
function cookieAccountPage(login: IntranetLogin, request: Request): string {
  return page(`
    <p id="session-state">${isSignedIn(login, request) ? "signed in" : "signed out"}</p>
    <p id="api-session-state"></p>
    <script>
      fetch("/api/session?login=${login}", { credentials: "include" })
        .then((response) => response.text())
        .then((state) => { document.getElementById("api-session-state").textContent = state; });
    </script>
    <form method="post" action="/sign-in?login=${login}"><button id="sign-in">Sign in</button></form>
    <form method="post" action="/sign-out?login=${login}"><button id="sign-out">Sign out</button></form>
  `);
}

function storageAccountPage(): string {
  return page(`
    <p id="session-state"></p>
    <p id="api-session-state"></p>
    <button id="sign-in" type="button">Sign in</button>
    <button id="sign-out" type="button">Sign out</button>
    <script>
      const key = ${JSON.stringify(STORAGE_TOKEN_KEY)};
      const state =
        localStorage.getItem(key) === ${JSON.stringify(SIGNED_IN_USER)} ? "signed in" : "signed out";
      // The token travels with API calls, so both say the same.
      for (const id of ["session-state", "api-session-state"]) document.getElementById(id).textContent = state;
      document.getElementById("sign-in").onclick = () => {
        localStorage.setItem(key, ${JSON.stringify(SIGNED_IN_USER)});
        location.reload();
      };
      document.getElementById("sign-out").onclick = () => {
        localStorage.removeItem(key);
        location.reload();
      };
    </script>
  `);
}

function page(body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Intranet</title></head><body><h1 id="intranet-heading">Intranet</h1>${body}</body></html>`;
}

/** Generated per run, so no private key is ever committed. */
async function selfSignedCertificateFor(
  hostname: string,
): Promise<{ readonly cert: string; readonly key: string }> {
  const directory = await mkdtemp(join(tmpdir(), "arc-like-peek-tls-"));
  try {
    const keyPath = join(directory, "key.pem");
    const certPath = join(directory, "cert.pem");
    const openssl = Bun.spawnSync([
      "openssl",
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "2",
      "-subj",
      `/CN=${hostname}`,
      "-addext",
      `subjectAltName=DNS:${hostname}`,
      "-keyout",
      keyPath,
      "-out",
      certPath,
    ]);
    if (!openssl.success) throw new Error(`openssl failed: ${openssl.stderr.toString()}`);
    return { cert: await Bun.file(certPath).text(), key: await Bun.file(keyPath).text() };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
