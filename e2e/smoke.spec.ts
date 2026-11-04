import { expect, test } from "./support/extension-test.ts";

test("content script is injected into pages", async ({ page, fixtureServer }) => {
  await page.goto(fixtureServer.url("/links.html"));

  await expect(page.locator("html")).toHaveAttribute("data-arc-like-peek", "ready");
});

test("no framing allowance is active until a peek opens", async ({ extensionServiceWorker }) => {
  const sessionRules = await extensionServiceWorker.evaluate(() =>
    chrome.declarativeNetRequest.getSessionRules(),
  );

  expect(sessionRules).toEqual([]);
});
