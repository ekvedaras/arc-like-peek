import type { BrowserContext, ConsoleMessage, Frame, Page, TestInfo } from "@playwright/test";
import { PEEK_FRAME_NAME } from "../../src/messaging/peek-messages.ts";
import { captureScreenshot } from "../support/artifacts.ts";
import { expect, test } from "../support/extension-test.ts";
import { shiftClick } from "../support/interactions.ts";
import { expectNoPeek, expectPeekPhase, peekOverlay } from "../support/peek-overlay.ts";

/**
 * Peek on live websites: does the peek open, does the peeked page render, does the page behind it
 * stay put, and do all the ways out work. Hits the network, so it is opt-in: `bun run test:real-sites`.
 */

type RealSite = {
  readonly name: string;
  readonly pageUrl: string;
  readonly linkSelector: string;
  /**
   * Something that is only visible once the peeked page has really rendered. Null for sites that hide
   * themselves when framed (a known limit, see wiki/decisions/2026-11-04-peek-framing.md): for them
   * only the page behind the peek and the ways out are checked.
   */
  readonly renderedSelector: string | null;
  /** A link inside the peeked page to follow, checking that the Peek navigates in place. */
  readonly inPeekLinkSelector?: string;
};

/** Visited before each site, so Back can be checked to still leave the site after peeking. */
const PREVIOUS_PAGE = "https://example.com/";

/** Google's EU cookie wall on YouTube; answered whenever it gets in the way of a click. */
const GOOGLE_COOKIE_WALL_REJECT = 'button[aria-label^="Reject"], button:has-text("Reject all")';

const REAL_SITES: readonly RealSite[] = [
  {
    name: "Wikipedia, article to article",
    pageUrl: "https://en.wikipedia.org/wiki/Arc_(web_browser)",
    linkSelector: 'main p a[href*="/wiki/"]:not([href*="/wiki/Help:"])',
    renderedSelector: "#firstHeading",
  },
  {
    name: "Wikipedia, strict-CSP host, to another site and on inside the peek",
    pageUrl: "https://en.wikipedia.org/wiki/Hacker_News",
    linkSelector: '.infobox a[href^="https://news.ycombinator.com"]',
    renderedSelector: ".titleline",
    inPeekLinkSelector: 'a[href="newest"]',
  },
  {
    name: "Wikipedia to a plain-http link",
    pageUrl: "https://en.wikipedia.org/wiki/Slashdot",
    linkSelector: '.infobox a[href^="http://slashdot.org"]',
    renderedSelector: "body",
  },
  {
    name: "GitHub, strict-CSP host, to its own framing-denied pages",
    pageUrl: "https://github.com/microsoft/playwright",
    linkSelector: 'a[href="/microsoft/playwright/issues"]',
    renderedSelector: "main",
  },
  {
    name: "GitHub, strict-CSP host, to another site and on inside the peek",
    pageUrl: "https://github.com/microsoft/playwright",
    linkSelector: 'a[href="https://playwright.dev"]',
    renderedSelector: "main",
    inPeekLinkSelector: 'a[href="/docs/intro"]',
  },
  {
    name: "Hacker News, front page to a framing-denied discussion",
    pageUrl: "https://news.ycombinator.com/",
    linkSelector: '.subline a[href^="item?id="]:last-child',
    renderedSelector: "table.fatitem",
  },
  {
    name: "MDN, reference to reference",
    pageUrl: "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a",
    linkSelector: 'main .content-section a[href^="/en-US/docs/Web/"]',
    renderedSelector: "main h1",
  },
  {
    name: "Wikipedia to a frame-busting site that blanks itself",
    pageUrl: "https://en.wikipedia.org/wiki/PayPal",
    linkSelector: '.infobox a[href^="http://paypal.com"]',
    renderedSelector: null,
  },
  {
    name: "YouTube, video to a recommended video",
    pageUrl: "https://www.youtube.com/watch?v=OOKMLMTroMo",
    linkSelector: 'ytd-watch-next-secondary-results-renderer a[href^="/watch"]',
    renderedSelector: "#movie_player, ytd-app",
  },
];

for (const site of REAL_SITES) {
  test(`peeks on ${site.name}`, async ({ page, context }, testInfo) => {
    const extensionProblems = collectExtensionProblems(context);
    const cookieWall = page.locator(GOOGLE_COOKIE_WALL_REJECT).first();
    await page.addLocatorHandler(cookieWall, () => cookieWall.click());
    await page.goto(PREVIOUS_PAGE, { waitUntil: "domcontentloaded" });
    await page.goto(site.pageUrl, { waitUntil: "domcontentloaded" });
    const hostUrl = page.url();
    const tabsBefore = context.pages().length;

    const opened = await openPeekAndExpectItRendered(page, site, testInfo, "open");
    expect(page.url(), "the page behind the peek must not navigate").toBe(hostUrl);
    expect(context.pages(), "shift+click must not open a window or tab").toHaveLength(tabsBefore);
    if (site.inPeekLinkSelector) {
      const before = opened.url();
      await opened.locator(site.inPeekLinkSelector).first().click();
      await expect.poll(() => peekedPageUrl(page)).not.toBe(before);
      await expectRendered(await peekedFrame(page), "body");
      await captureScreenshot(page, testInfo, "navigated-inside-peek");
      expect(page.url(), "navigating inside the peek must not navigate the page").toBe(hostUrl);
    }
    await page.keyboard.press("Escape");
    await expectNoPeek(page);

    await openPeekAndExpectItRendered(page, site, testInfo, "before-scrim-click");
    await page.mouse.click(20, 400);
    await expectNoPeek(page);

    await openPeekAndExpectItRendered(page, site, testInfo, "before-close-button");
    await peekOverlay(page).closeButton.click();
    await expectNoPeek(page);

    const shown = await openPeekAndExpectItRendered(page, site, testInfo, "before-expand");
    const shownUrl = shown.url();
    const openedTab = context.waitForEvent("page");
    await peekOverlay(page).expandButton.click();
    const tab = await openedTab;
    await tab.waitForLoadState("domcontentloaded");
    expect(withoutHash(tab.url()), "expanding opens the page the peek showed").toBe(
      withoutHash(shownUrl),
    );
    await expectNoPeek(page);

    expect(page.url(), "the page behind the peek must not navigate").toBe(hostUrl);
    expect(context.pages(), "only expanding opens a tab").toHaveLength(tabsBefore + 1);
    expect(extensionProblems).toEqual([]);

    await page.goBack({ waitUntil: "domcontentloaded" });
    expect(page.url(), "Back leaves the page as if no peek had been there").toBe(PREVIOUS_PAGE);
  });
}

async function openPeekAndExpectItRendered(
  page: Page,
  site: RealSite,
  testInfo: TestInfo,
  screenshotName: string,
): Promise<Frame> {
  const link = page.locator(site.linkSelector).filter({ visible: true }).first();
  await link.scrollIntoViewIfNeeded();
  await shiftClick(link);
  await expectPeekPhase(page, "open");
  const frame = await peekedFrame(page);
  try {
    if (site.renderedSelector) await expectRendered(frame, site.renderedSelector);
    else await expectLoaded(frame);
  } finally {
    await captureScreenshot(page, testInfo, screenshotName);
  }
  return frame;
}

async function expectLoaded(frame: Frame): Promise<void> {
  await frame.waitForLoadState("domcontentloaded");
  expect(frame.url(), "the peeked page must load, not show Chrome's error page").toMatch(/^https:/);
}

async function expectRendered(frame: Frame, renderedSelector: string): Promise<void> {
  await expectLoaded(frame);
  await expect(frame.locator(renderedSelector).first()).toBeVisible();
  await expect
    .poll(async () => ((await frame.locator("body").textContent()) ?? "").trim().length)
    .toBeGreaterThan(100);
}

function peekedPageUrl(page: Page): string {
  return page.frame({ name: PEEK_FRAME_NAME })?.url() ?? "";
}

async function peekedFrame(page: Page): Promise<Frame> {
  await expect.poll(() => peekedPageUrl(page)).toMatch(/^https?:/);
  const frame = page.frame({ name: PEEK_FRAME_NAME });
  if (!frame) throw new Error("The peek has no frame");
  return frame;
}

function withoutHash(url: string): string {
  return url.split("#")[0] ?? url;
}

/**
 * Chrome warns about every frame sandboxed with both allow-scripts and allow-same-origin. A page of
 * the page behind's own site is framed that way on purpose: it needs its origin for its sign-in, and
 * the sandbox is there only to stop frame-busting (wiki/decisions/2026-11-04-same-site-peek.md).
 */
const EXPECTED_SANDBOX_WARNING =
  "An iframe which has both allow-scripts and allow-same-origin for its sandbox attribute can escape its sandboxing.";

/** Console errors, warnings and uncaught exceptions that come from the extension's own scripts. */
function collectExtensionProblems(context: BrowserContext): string[] {
  const problems: string[] = [];
  const fromExtension = (message: ConsoleMessage) =>
    message.location().url.startsWith("chrome-extension://");
  const onConsole = (message: ConsoleMessage) => {
    if (message.text() === EXPECTED_SANDBOX_WARNING) return;
    if ((message.type() === "error" || message.type() === "warning") && fromExtension(message))
      problems.push(`${message.type()}: ${message.text()}`);
  };
  context.on("console", onConsole);
  for (const worker of context.serviceWorkers()) worker.on("console", onConsole);
  context.on("weberror", (error) => {
    if (error.error().stack?.includes("chrome-extension://"))
      problems.push(`uncaught: ${error.error().message}`);
  });
  return problems;
}
