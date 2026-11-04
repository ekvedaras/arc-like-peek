import type { BrowserContext, FrameLocator, Page, Worker } from "@playwright/test";
import type { IntranetApp, IntranetLogin } from "./fixtures/intranet-app.ts";
import type { FixtureServer } from "./fixtures/server.ts";
import { expect, test } from "./support/extension-test.ts";
import { shiftClick } from "./support/interactions.ts";
import { expectNoPeek, expectPeekPhase, peekOverlay } from "./support/peek-overlay.ts";

const COOKIE_LOGINS = ["lax-cookie", "strict-cookie", "none-cookie"] as const;

/** Both the page's own request and the API calls it makes must carry the login. */
async function expectSession(
  account: FrameLocator | Page,
  state: "signed in" | "signed out",
): Promise<void> {
  await expect(account.locator("#session-state")).toHaveText(state);
  await expect(account.locator("#api-session-state")).toHaveText(state);
}

async function signInInTab(
  context: BrowserContext,
  intranetApp: IntranetApp,
  login: IntranetLogin,
): Promise<void> {
  const tab = await context.newPage();
  await tab.goto(intranetApp.accountUrl(login));
  await tab.locator("#sign-in").click();
  await expectSession(tab, "signed in");
  await tab.close();
}

async function expectSessionInTab(
  context: BrowserContext,
  intranetApp: IntranetApp,
  login: IntranetLogin,
  expected: "signed in" | "signed out",
): Promise<void> {
  const tab = await context.newPage();
  await tab.goto(intranetApp.accountUrl(login));
  await expectSession(tab, expected);
  await tab.close();
}

/** Peeks at the intranet's account page from a page on another site. */
async function peekAtAccount(
  page: Page,
  fixtureServer: FixtureServer,
  intranetApp: IntranetApp,
  login: IntranetLogin,
): Promise<void> {
  await page.goto(fixtureServer.url("/links.html"));
  await page.evaluate((href) => {
    const link = document.createElement("a");
    link.id = "intranet-account-link";
    link.href = href;
    link.textContent = "Intranet account";
    document.body.prepend(link);
  }, intranetApp.accountUrl(login));
  await shiftClick(page.locator("#intranet-account-link"));
  await expectPeekPhase(page, "open");
}

/** Copies of first-party cookies the extension lent to Peeks, in any partition. */
function lentCookieCount(extensionServiceWorker: Worker): Promise<number> {
  return extensionServiceWorker.evaluate(async () => {
    const cookies = await chrome.cookies.getAll({ partitionKey: {} });
    return cookies.filter((cookie) => cookie.partitionKey !== undefined).length;
  });
}

async function embedAccountInPage(page: Page, url: string): Promise<string | null> {
  await page.evaluate(
    (src) =>
      new Promise<void>((resolve) => {
        const frame = document.createElement("iframe");
        frame.id = "embedded-account";
        frame.addEventListener("load", () => resolve(), { once: true });
        frame.src = src;
        document.body.append(frame);
      }),
    url,
  );
  return page.frameLocator("#embedded-account").locator("#session-state").textContent();
}

for (const thirdPartyCookies of ["allowed", "blocked"] as const) {
  test.describe(`signed in inside a peek, with third-party cookies ${thirdPartyCookies}`, () => {
    test.use({ thirdPartyCookies });

    for (const login of COOKIE_LOGINS) {
      test(`a site signed in to in a tab (${login}) is signed in when peeked from another site`, async ({
        page,
        context,
        fixtureServer,
        intranetApp,
      }) => {
        await signInInTab(context, intranetApp, login);

        await peekAtAccount(page, fixtureServer, intranetApp, login);

        await expectSession(peekOverlay(page).frame, "signed in");
      });

      test(`signing in inside a peek (${login}) signs in tabs too`, async ({
        page,
        context,
        fixtureServer,
        intranetApp,
      }) => {
        await peekAtAccount(page, fixtureServer, intranetApp, login);
        const account = peekOverlay(page).frame;
        await expectSession(account, "signed out");

        await account.locator("#sign-in").click();

        await expectSession(account, "signed in");
        await expectSessionInTab(context, intranetApp, login, "signed in");
      });
    }

    test("signing out inside a peek signs out tabs too", async ({
      page,
      context,
      fixtureServer,
      intranetApp,
    }) => {
      await signInInTab(context, intranetApp, "lax-cookie");
      await peekAtAccount(page, fixtureServer, intranetApp, "lax-cookie");
      const account = peekOverlay(page).frame;
      await expectSession(account, "signed in");

      await account.locator("#sign-out").click();

      await expectSession(account, "signed out");
      await expectSessionInTab(context, intranetApp, "lax-cookie", "signed out");
    });

    test("closing the peek leaves tabs signed in", async ({
      page,
      context,
      fixtureServer,
      intranetApp,
    }) => {
      await signInInTab(context, intranetApp, "lax-cookie");
      await peekAtAccount(page, fixtureServer, intranetApp, "lax-cookie");
      await expectSession(peekOverlay(page).frame, "signed in");

      await page.keyboard.press("Escape");
      await expectNoPeek(page);

      await expectSessionInTab(context, intranetApp, "lax-cookie", "signed in");
    });

    test("while a peek is open, the visited site framed by the page behind is signed in too (known exposure)", async ({
      page,
      context,
      fixtureServer,
      intranetApp,
    }) => {
      await signInInTab(context, intranetApp, "strict-cookie");
      await peekAtAccount(page, fixtureServer, intranetApp, "strict-cookie");
      await expectSession(peekOverlay(page).frame, "signed in");

      expect(await embedAccountInPage(page, intranetApp.accountUrl("strict-cookie"))).toBe(
        "signed in",
      );
    });

    test("once the peek is closed, the site embedded by the page behind is signed out again", async ({
      page,
      context,
      fixtureServer,
      intranetApp,
      extensionServiceWorker,
    }) => {
      await signInInTab(context, intranetApp, "lax-cookie");
      await peekAtAccount(page, fixtureServer, intranetApp, "lax-cookie");
      await expectSession(peekOverlay(page).frame, "signed in");
      expect(await lentCookieCount(extensionServiceWorker)).toBeGreaterThan(0);

      await page.keyboard.press("Escape");
      await expectNoPeek(page);
      // The overlay goes first; the Peek's access is revoked right after.
      await expect.poll(() => lentCookieCount(extensionServiceWorker)).toBe(0);

      expect(await embedAccountInPage(page, intranetApp.accountUrl("lax-cookie"))).toBe(
        "signed out",
      );
    });

    test("a site that keeps its login in localStorage stays signed out in a peek (storage is partitioned)", async ({
      page,
      context,
      fixtureServer,
      intranetApp,
    }) => {
      await signInInTab(context, intranetApp, "local-storage");

      await peekAtAccount(page, fixtureServer, intranetApp, "local-storage");

      await expect(peekOverlay(page).frame.locator("#session-state")).toHaveText("signed out");
    });
  });
}
