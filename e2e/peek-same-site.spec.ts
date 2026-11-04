import type { BrowserContext, FrameLocator, Page } from "@playwright/test";
import type { IntranetApp, IntranetLogin } from "./fixtures/intranet-app.ts";
import { expect, test } from "./support/extension-test.ts";
import { shiftClick } from "./support/interactions.ts";
import { expectNoPeek, expectPeekPhase, peekOverlay } from "./support/peek-overlay.ts";

const SAME_SITE_LOGINS = [
  "lax-cookie",
  "strict-cookie",
  "local-storage",
  "single-sign-on",
] as const;

/** Both the page's own request and the API calls it makes must carry the login. */
async function expectSession(
  account: FrameLocator | Page,
  state: "signed in" | "signed out",
): Promise<void> {
  await expect(account.locator("#session-state")).toHaveText(state);
  await expect(account.locator("#api-session-state")).toHaveText(state);
}

/** Signs in on the app's own account page; single sign-on goes through the company's SSO. */
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

/** Peeks at the app's account page from the app's dashboard, as from its sidebar. */
async function peekAtAccountFromDashboard(
  page: Page,
  intranetApp: IntranetApp,
  login: IntranetLogin,
): Promise<FrameLocator> {
  await page.goto(intranetApp.dashboardUrl(login));
  await shiftClick(page.locator("#account-link"));
  await expectPeekPhase(page, "open");
  return peekOverlay(page).sameSiteFrame;
}

for (const thirdPartyCookies of ["allowed", "blocked"] as const) {
  test.describe(`a peek of the app's own pages, with third-party cookies ${thirdPartyCookies}`, () => {
    test.use({ thirdPartyCookies });

    for (const login of SAME_SITE_LOGINS) {
      test(`is signed in when the user is signed in to the app (${login})`, async ({
        page,
        context,
        intranetApp,
      }) => {
        await signInInTab(context, intranetApp, login);

        const account = await peekAtAccountFromDashboard(page, intranetApp, login);

        await expectSession(account, "signed in");
      });
    }

    for (const login of ["lax-cookie", "local-storage"] as const) {
      test(`signing in inside it signs in tabs too (${login})`, async ({
        page,
        context,
        intranetApp,
      }) => {
        const account = await peekAtAccountFromDashboard(page, intranetApp, login);
        await expectSession(account, "signed out");

        await account.locator("#sign-in").click();

        await expectSession(account, "signed in");
        await expectSessionInTab(context, intranetApp, login, "signed in");
      });
    }
  });
}

test.describe("navigating inside a peek of the app's own pages", () => {
  test("links to the app's pages stay signed in", async ({ page, context, intranetApp }) => {
    await signInInTab(context, intranetApp, "local-storage");
    const account = await peekAtAccountFromDashboard(page, intranetApp, "local-storage");
    await expectSession(account, "signed in");

    await account.locator("#dashboard-link").click();
    await expect(account.locator("#account-link")).toBeVisible();
    await account.locator("#account-link").click();

    await expectSession(account, "signed in");
  });

  test("a link to another site opens in the peek, although the app's CSP lets it frame only itself", async ({
    page,
    intranetApp,
  }) => {
    const account = await peekAtAccountFromDashboard(page, intranetApp, "lax-cookie");

    await account.locator("#sso-provider-link").click();

    await expect(peekOverlay(page).frame.locator("#sso-provider-heading")).toBeVisible();
    await expect(page).toHaveURL(intranetApp.dashboardUrl("lax-cookie"));
  });

  test("Back still leaves the page after going to another site inside the peek and closing it", async ({
    page,
    intranetApp,
  }) => {
    await page.goto(intranetApp.accountUrl("lax-cookie"));
    const account = await peekAtAccountFromDashboard(page, intranetApp, "lax-cookie");
    await account.locator("#dashboard-link").click();
    await expect(account.locator("#account-link")).toBeVisible();
    await account.locator("#account-link").click();
    await account.locator("#sso-provider-link").click();
    await expect(peekOverlay(page).frame.locator("#sso-provider-heading")).toBeVisible();

    await page.keyboard.press("Escape");
    await expectNoPeek(page);
    await page.goBack();

    await expect(page).toHaveURL(intranetApp.accountUrl("lax-cookie"));
  });

  test("a peek of the app after its session ended shows the company's sign-in", async ({
    page,
    context,
    intranetApp,
  }) => {
    await signInInTab(context, intranetApp, "single-sign-on");
    await context.clearCookies({ name: "intranet_single_sign_on" });

    const account = await peekAtAccountFromDashboard(page, intranetApp, "single-sign-on");

    await expect(account.locator("#sign-in")).toHaveText("Sign in with SSO");
  });
});
