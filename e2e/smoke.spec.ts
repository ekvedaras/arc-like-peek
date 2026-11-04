import { expect, test } from "./support/extension-test.ts";

test("content script is injected into pages", async ({ page, fixtureServer }) => {
  await page.goto(fixtureServer.url("/links.html"));

  await expect(page.locator("html")).toHaveAttribute("data-arc-like-peek", "ready");
});

test("service worker runs with the frame header ruleset enabled", async ({
  extensionServiceWorker,
}) => {
  const enabledRulesets = await extensionServiceWorker.evaluate(() =>
    chrome.declarativeNetRequest.getEnabledRulesets(),
  );

  expect(enabledRulesets).toContain("frame-header-stripping");
});
