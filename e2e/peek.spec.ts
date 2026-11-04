import type { Frame, Page } from "@playwright/test";
import { PEEK_OPEN_CURVE } from "../src/peek/choreography.ts";
import { peekLayout } from "../src/peek/geometry.ts";
import { PEEK_MOTION } from "../src/peek/motion-tokens.ts";
import { springCurve } from "../src/peek/spring.ts";
import {
  type AnimationSample,
  cubicBezier,
  durationMismatchMs,
  isMonotonic,
  maxDeviationFromEasing,
  measureTransition,
  traceAnimation,
} from "./support/animation-trace.ts";
import { captureScreenshot } from "./support/artifacts.ts";
import { expect, test } from "./support/extension-test.ts";
import { shiftClick } from "./support/interactions.ts";
import {
  expectNoPeek,
  expectPeekPhase,
  PEEK_SELECTORS,
  peekOverlay,
  rectOf,
} from "./support/peek-overlay.ts";

const PIXEL_TOLERANCE = 2;
/** A moment of the open spring where the pane is clearly still growing. */
const MID_FLIGHT_MS = 60;

async function openPeek(page: Page, linkSelector: string): Promise<void> {
  await shiftClick(page.locator(linkSelector));
  await expectPeekPhase(page, "open");
}

function presentSamples(samples: readonly AnimationSample[]): AnimationSample[] {
  return samples.filter((sample) => sample.isPresent);
}

function expectRectNear(
  actual: { x: number; y: number; width: number; height: number },
  expected: { x: number; y: number; width: number; height: number },
): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
}

test.describe("opening a peek", () => {
  test("shift+click on a link grows the peek out of the link with a spring", async ({
    page,
    fixtureServer,
  }, testInfo) => {
    await page.goto(fixtureServer.url("/links.html"));
    const link = page.locator("#cross-site-link");
    const linkRect = await rectOf(link);

    const pane = await traceAnimation(page, PEEK_SELECTORS.pane, () => shiftClick(link), {
      durationMs: 900,
    });

    const frames = presentSamples(pane);
    const first = frames[0];
    const last = frames.at(-1);
    if (!(first && last)) throw new Error("The pane never appeared");
    expectRectNear(first.rect, linkRect);
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("No viewport");
    expectRectNear(last.rect, peekLayout(viewport).pane);

    const growth = measureTransition(pane, "scaleX");
    expect(growth.to).toBe(1);
    expect(durationMismatchMs(growth, PEEK_OPEN_CURVE.duration)).toBeLessThan(80);
    expect(maxDeviationFromEasing(pane, "scaleX", PEEK_OPEN_CURVE.progressAt, growth)).toBeLessThan(
      0.1,
    );
    expect(Math.max(...frames.map((sample) => sample.scaleX))).toBeGreaterThan(1);

    await expectPeekPhase(page, "open");
    await expect(peekOverlay(page).frame.locator("#peeked-heading")).toBeVisible();
    await captureScreenshot(page, testInfo, "peek-open");
  });

  test("the scrim fades in over the page while the pane grows", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url("/links.html"));

    const scrim = await traceAnimation(
      page,
      PEEK_SELECTORS.scrim,
      () => shiftClick(page.locator("#cross-site-link")),
      { durationMs: 600 },
    );

    const fade = measureTransition(scrim, "opacity");
    expect(fade.from).toBe(0);
    expect(fade.to).toBe(1);
    expect(isMonotonic(scrim, "opacity")).toBe(true);
    expect(durationMismatchMs(fade, PEEK_MOTION.scrimFadeIn.duration)).toBeLessThan(80);
    expect(
      maxDeviationFromEasing(scrim, "opacity", cubicBezier(...PEEK_MOTION.scrimFadeIn.easing)),
    ).toBeLessThan(0.1);
  });

  test("the keyboard scrolls the peeked page, not the page behind it", async ({
    page,
    fixtureServer,
  }) => {
    await page.goto(fixtureServer.url("/links.html"));
    await openPeek(page, "#cross-site-long-link");
    await expect(peekOverlay(page).frame.locator("#section-1")).toBeVisible();
    const peekedFrame = page.frame({ url: fixtureServer.crossSiteUrl("/long-page.html") });

    await page.keyboard.press("PageDown");

    await expect.poll(() => peekedFrame?.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("shift+click on an element inside a link peeks at the link", async ({
    page,
    fixtureServer,
  }) => {
    await page.goto(fixtureServer.url("/links.html"));

    await openPeek(page, "#nested-element-link strong");

    await expect(peekOverlay(page).frame.locator("#section-1")).toBeVisible();
  });

  test("a plain click still follows the link", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url("/links.html"));

    await page.locator("#same-origin-link").click();

    await expect(page).toHaveURL(fixtureServer.url("/long-page.html"));
    await expectNoPeek(page);
  });

  test("with reduced motion the peek only crossfades", async ({ page, fixtureServer }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(fixtureServer.url("/links.html"));

    const pane = await traceAnimation(
      page,
      PEEK_SELECTORS.pane,
      () => shiftClick(page.locator("#cross-site-link")),
      { durationMs: 400 },
    );

    expect(presentSamples(pane).every((sample) => sample.scaleX === 1)).toBe(true);
    const fade = measureTransition(pane, "opacity");
    expect(durationMismatchMs(fade, PEEK_MOTION.reducedMotionFade.duration)).toBeLessThan(80);
  });
});

test.describe("Arc's finer motion", () => {
  test("the pane's height sets off after its width and follows its own spring", async ({
    page,
    fixtureServer,
  }) => {
    await page.goto(fixtureServer.url("/links.html"));
    // Slowed so that a renderer with few frames per second still samples the part of the flight being compared.
    const devtools = await page.context().newCDPSession(page);
    await devtools.send("Animation.enable");
    await devtools.send("Animation.setPlaybackRate", { playbackRate: 0.25 });

    const pane = await traceAnimation(
      page,
      PEEK_SELECTORS.pane,
      () => shiftClick(page.locator("#cross-site-link")),
      { durationMs: 900 },
    );

    const width = measureTransition(pane, "scaleX");
    const height = measureTransition(pane, "scaleY");
    const progressOf = (sample: AnimationSample, property: "scaleX" | "scaleY"): number => {
      const { from, to } = property === "scaleX" ? width : height;
      return (sample[property] - from) / (to - from);
    };
    const early = presentSamples(pane).filter(
      (sample) => progressOf(sample, "scaleX") > 0.15 && progressOf(sample, "scaleX") < 0.9,
    );
    expect(early.length).toBeGreaterThan(2);
    for (const sample of early) {
      expect(progressOf(sample, "scaleY")).toBeLessThan(progressOf(sample, "scaleX"));
    }
    const vertical = springCurve(PEEK_MOTION.openSpringVertical, PEEK_MOTION.springSettleTolerance);
    const lag = PEEK_MOTION.openVerticalLag;
    expect(
      maxDeviationFromEasing(
        pane,
        "scaleY",
        (progress) =>
          vertical.progressAt(
            Math.max(0, progress * (vertical.duration + lag) - lag) / vertical.duration,
          ),
        height,
      ),
    ).toBeLessThan(0.1);
  });

  test("a snapshot of the link's row covers the pane at first and fades out", async ({
    page,
    fixtureServer,
  }) => {
    await page.goto(fixtureServer.url("/links.html"));

    const snapshot = await traceAnimation(
      page,
      PEEK_SELECTORS.snapshot,
      () => shiftClick(page.locator("#cross-site-link")),
      { durationMs: 400 },
    );

    const seen = presentSamples(snapshot);
    expect(Math.max(...seen.map((sample) => sample.opacity))).toBeGreaterThan(0.5);
    expect(seen.at(-1)?.opacity).toBe(0);
    expect(isMonotonic(snapshot, "opacity")).toBe(true);
    await expect(peekOverlay(page).snapshot).toContainText("Cross-site article");
  });

  test("closing collapses the pane into a line without height at the top of the link's row", async ({
    page,
    fixtureServer,
  }) => {
    await page.goto(fixtureServer.url("/links.html"));
    const row = await rectOf(page.locator("li:has(#cross-site-link)"));
    await openPeek(page, "#cross-site-link");

    const pane = await traceAnimation(
      page,
      PEEK_SELECTORS.pane,
      () => page.keyboard.press("Escape"),
      { durationMs: 700 },
    );

    const last = presentSamples(pane).at(-1);
    if (!last) throw new Error("The pane was never traced");
    expect(last.rect.height).toBeLessThan(0.05 * (await rectOf(page.locator("body"))).height);
    expect(Math.abs(last.rect.y - row.y)).toBeLessThan(0.05 * 700);
    expect(isMonotonic(pane, "scaleY")).toBe(true);
    await expectNoPeek(page);
  });

  test("the scrim and controls take the page's theme colour", async ({ page, fixtureServer }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(fixtureServer.url("/themed-links.html"));
    await openPeek(page, "#cross-site-link");

    const [red = 0, green = 0, blue = 0] = (
      (
        await peekOverlay(page).closeButton.evaluate(
          (button) => getComputedStyle(button).backgroundColor,
        )
      ).match(/\d+/g) ?? []
    ).map(Number);
    expect(green).toBeGreaterThan(red);
    expect(green).toBeGreaterThan(blue);
    const scrim = await peekOverlay(page).scrim.evaluate(
      (each) => getComputedStyle(each).backgroundColor,
    );
    const [scrimRed = 0, scrimGreen = 0] = (scrim.match(/[\d.]+/g) ?? []).map(Number);
    expect(scrimGreen).toBeGreaterThan(scrimRed);
  });
});

test.describe("a peek of a page that is slow to show", () => {
  test("the pane flies at once without the page, as Arc's does, and the page fills in later", async ({
    page,
    fixtureServer,
  }) => {
    await page.goto(fixtureServer.url("/links.html"));

    const pane = await traceAnimation(
      page,
      PEEK_SELECTORS.pane,
      () => shiftClick(page.locator("#cross-site-slow-link")),
      { durationMs: 900 },
    );

    const growth = measureTransition(pane, "scaleX");
    expect(growth.to).toBe(1);
    expect(durationMismatchMs(growth, PEEK_OPEN_CURVE.duration)).toBeLessThan(80);
    await expectPeekPhase(page, "open");
    await expect(peekOverlay(page).frame.locator("#peeked-heading")).toHaveCount(0);
  });
});

test.describe("closing a peek", () => {
  test("Esc pressed inside the peeked page shrinks the peek back into its link", async ({
    page,
    fixtureServer,
  }, testInfo) => {
    await page.goto(fixtureServer.url("/links.html"));
    const link = page.locator("#cross-site-link");
    const linkRect = await rectOf(link);
    await openPeek(page, "#cross-site-link");
    await expect(peekOverlay(page).frame.locator("#peeked-heading")).toBeVisible();

    const pane = await traceAnimation(
      page,
      PEEK_SELECTORS.pane,
      () => page.keyboard.press("Escape"),
      { durationMs: 700 },
    );

    const frames = presentSamples(pane);
    const first = frames[0];
    const last = frames.at(-1);
    if (!(first && last)) throw new Error("The pane was never traced");
    expect(isMonotonic(pane, "scaleX")).toBe(true);
    // The overlay is removed on the frame the flight ends, so the last sampled frame is just before it.
    const travelled = (first.rect.width - last.rect.width) / (first.rect.width - linkRect.width);
    expect(travelled).toBeGreaterThan(0.97);
    expect(Math.abs(last.rect.x - linkRect.x)).toBeLessThan(
      0.03 * Math.abs(first.rect.x - linkRect.x) + PIXEL_TOLERANCE,
    );
    expect(pane.at(-1)?.isPresent).toBe(false);
    await expectNoPeek(page);
    await expect(link).toBeFocused();
    await captureScreenshot(page, testInfo, "after-escape");
  });

  test("clicking the scrim outside the pane closes the peek", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url("/links.html"));
    await openPeek(page, "#cross-site-link");

    await page.mouse.click(40, 400);

    await expectPeekPhase(page, "closing");
    await expectNoPeek(page);
  });

  test("the close button closes the peek", async ({ page, fixtureServer }, testInfo) => {
    await page.goto(fixtureServer.url("/links.html"));
    await openPeek(page, "#cross-site-link");
    await captureScreenshot(page, testInfo, "controls");

    await peekOverlay(page).closeButton.click();

    await expectNoPeek(page);
  });

  test("closing while the peek is still opening reverses from where it is", async ({
    page,
    fixtureServer,
  }) => {
    await page.goto(fixtureServer.url("/links.html"));
    // Hold the opening mid-flight, so Esc lands there however long the machine takes to deliver it.
    const devtools = await page.context().newCDPSession(page);
    await devtools.send("Animation.enable");
    await devtools.send("Animation.setPlaybackRate", { playbackRate: 0 });
    await shiftClick(page.locator("#cross-site-link"));
    // Park the flight only once every animation has set off, after the pane's departure delay.
    await expect
      .poll(() =>
        page.evaluate((host) => {
          const animations = document.querySelector(host)?.shadowRoot?.getAnimations() ?? [];
          return animations.length > 0 && animations.every((each) => each.playState === "running");
        }, PEEK_SELECTORS.host),
      )
      .toBe(true);
    await page.evaluate(
      ({ host, midFlightMs }) => {
        for (const animation of document.querySelector(host)?.shadowRoot?.getAnimations() ?? []) {
          animation.pause();
          animation.currentTime = midFlightMs;
        }
      },
      { host: PEEK_SELECTORS.host, midFlightMs: MID_FLIGHT_MS },
    );
    await devtools.send("Animation.setPlaybackRate", { playbackRate: 1 });
    await expectPeekPhase(page, "opening");

    const pane = await traceAnimation(
      page,
      PEEK_SELECTORS.pane,
      () => page.keyboard.press("Escape"),
      {
        durationMs: 600,
      },
    );

    const frames = presentSamples(pane);
    const midFlightScale = frames[0]?.scaleX ?? 0;
    expect(midFlightScale).toBeGreaterThan(0.3);
    expect(midFlightScale).toBeLessThan(0.95);
    expect(isMonotonic(pane, "scaleX")).toBe(true);
    const largest = Math.max(...presentSamples(pane).map((sample) => sample.scaleX));
    expect(largest).toBeLessThan(1);
    expect(pane.at(-1)?.isPresent).toBe(false);
    await expectNoPeek(page);
  });
});

test.describe("expanding a peek into a tab", () => {
  test("the expand button grows the peek to fill the page, then opens it as a tab", async ({
    page,
    context,
    fixtureServer,
  }) => {
    await page.goto(fixtureServer.url("/links.html"));
    await openPeek(page, "#cross-site-link");
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("No viewport");

    const newTab = context.waitForEvent("page");
    const pane = await traceAnimation(
      page,
      PEEK_SELECTORS.pane,
      () => peekOverlay(page).expandButton.click(),
      { durationMs: 600 },
    );

    const coveringFrame = presentSamples(pane).at(-1);
    if (!coveringFrame) throw new Error("The pane was never traced");
    expectRectNear(coveringFrame.rect, { x: 0, y: 0, ...viewport });
    const tab = await newTab;
    await expect(tab).toHaveURL(fixtureServer.crossSiteUrl("/peeked.html"));
    await expectNoPeek(page);
  });

  test("expanding lays the page out like its tab at once and holds it still while the pane grows", async ({
    page,
    fixtureServer,
  }) => {
    await page.goto(fixtureServer.url("/links.html"));
    await openPeek(page, "#cross-site-link");
    await expect(peekOverlay(page).frame.locator("#peeked-heading")).toBeVisible();
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("No viewport");
    const fullPage = { x: 0, y: 0, ...viewport };
    const paneRect = peekLayout(viewport).pane;

    const frame = await traceAnimation(
      page,
      PEEK_SELECTORS.frame,
      () => peekOverlay(page).expandButton.click(),
      { durationMs: 600 },
    );

    const frames = presentSamples(frame);
    const isAt = (rect: AnimationSample["rect"], expected: typeof fullPage) =>
      [
        rect.x - expected.x,
        rect.y - expected.y,
        rect.width - expected.width,
        rect.height - expected.height,
      ].every((difference) => Math.abs(difference) <= PIXEL_TOLERANCE);
    const firstExpanded = frames.findIndex((sample) => !isAt(sample.rect, paneRect));
    expect(firstExpanded).toBeGreaterThanOrEqual(0);
    for (const sample of frames.slice(firstExpanded)) expectRectNear(sample.rect, fullPage);
  });

  test("the tab a peek expands into loads out of sight, then takes over", async ({
    page,
    context,
    extensionServiceWorker,
    fixtureServer,
  }) => {
    await page.goto(fixtureServer.url("/links.html"));
    await openPeek(page, "#cross-site-link");
    // Headless Playwright reports every page as visible, so ask Chrome which tab is active instead.
    await extensionServiceWorker.evaluate(() => {
      const events: { what: string; atMs: number }[] = [];
      const record = (what: string) => events.push({ what, atMs: performance.now() });
      Reflect.set(globalThis, "expandedTabEvents", events);
      chrome.tabs.onCreated.addListener((tab) => record(`created active=${tab.active}`));
      chrome.tabs.onUpdated.addListener((_tabId, change, tab) => {
        if (change.status === "complete") record(`loaded active=${tab.active}`);
      });
      chrome.tabs.onActivated.addListener(() => record("switched to"));
    });

    const newTab = context.waitForEvent("page");
    await peekOverlay(page).expandButton.click();
    const tab = await newTab;

    await expect(tab).toHaveURL(fixtureServer.crossSiteUrl("/peeked.html"));
    await expectNoPeek(page);
    const events: { what: string; atMs: number }[] = await extensionServiceWorker.evaluate(() =>
      Reflect.get(globalThis, "expandedTabEvents"),
    );
    const [created, ...later] = events;
    expect(created?.what).toBe("created active=false");
    const switched = later.find((event) => event.what === "switched to");
    if (!(created && switched)) throw new Error("Chrome never switched to the new tab");
    const loadedOutOfSight = later.some(
      (event) => event.what === "loaded active=false" && event.atMs <= switched.atMs,
    );
    // A tab still loading is only switched to once the longest wait is over.
    if (!loadedOutOfSight) {
      expect(switched.atMs - created.atMs).toBeGreaterThanOrEqual(
        PEEK_MOTION.tabHandoverMaxWait - 1,
      );
    }
  });

  test("links inside the peek navigate the peek, and expanding opens where the user went", async ({
    page,
    context,
    fixtureServer,
  }) => {
    await page.goto(fixtureServer.url("/links.html"));
    await openPeek(page, "#cross-site-link");

    await peekOverlay(page).frame.locator("#in-peek-link").click();
    await expect(peekOverlay(page).frame.locator("#section-1")).toBeVisible();
    await expect(page).toHaveURL(fixtureServer.url("/links.html"));

    const newTab = context.waitForEvent("page");
    await page.keyboard.press("ControlOrMeta+o");
    await expect(await newTab).toHaveURL(fixtureServer.crossSiteUrl("/long-page.html"));
    await expectNoPeek(page);
  });

  test("shift+click inside the peek navigates the same peek", async ({
    page,
    context,
    fixtureServer,
  }) => {
    await page.goto(fixtureServer.url("/links.html"));
    await openPeek(page, "#cross-site-link");

    await shiftClick(peekOverlay(page).frame.locator("#in-peek-link"));

    await expect(peekOverlay(page).frame.locator("#section-1")).toBeVisible();
    expect(context.pages()).toHaveLength(1);
  });

  test("links targeting the top window stay inside the peek", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url("/links.html"));
    await openPeek(page, "#cross-site-link");

    await peekOverlay(page).frame.locator("#top-target-link").click();

    await expect(peekOverlay(page).frame.locator("#section-1")).toBeVisible();
    await expect(page).toHaveURL(fixtureServer.url("/links.html"));
  });
});

test.describe("pages that resist being framed", () => {
  test("a page sending X-Frame-Options and frame-ancestors still shows in the peek", async ({
    page,
    fixtureServer,
    extensionServiceWorker,
  }, testInfo) => {
    await page.goto(fixtureServer.url("/links.html"));

    await openPeek(page, "#cross-site-framing-denied-link");

    await expect(peekOverlay(page).frame.locator("#framing-denied-heading")).toBeVisible();
    await captureScreenshot(page, testInfo, "framing-denied-in-peek");
    const rules = await extensionServiceWorker.evaluate(() =>
      chrome.declarativeNetRequest.getSessionRules(),
    );
    expect(rules).toHaveLength(1);
    expect(rules[0]?.condition).toMatchObject({ resourceTypes: ["sub_frame"] });
    expect(rules[0]?.condition.tabIds).toHaveLength(1);
  });

  test("framing stays denied in other tabs and after the peek closes", async ({
    page,
    context,
    fixtureServer,
    extensionServiceWorker,
  }) => {
    await page.goto(fixtureServer.url("/links.html"));
    await openPeek(page, "#cross-site-framing-denied-link");
    const otherTab = await context.newPage();
    await otherTab.goto(fixtureServer.url("/long-page.html"));

    expect(
      await framedHeadingCount(otherTab, fixtureServer.crossSiteUrl("/framing-denied.html")),
    ).toBe(0);

    await page.bringToFront();
    await page.keyboard.press("Escape");
    await expectNoPeek(page);
    expect(
      await extensionServiceWorker.evaluate(() => chrome.declarativeNetRequest.getSessionRules()),
    ).toEqual([]);
    expect(await framedHeadingCount(page, fixtureServer.crossSiteUrl("/framing-denied.html"))).toBe(
      0,
    );
  });

  test("a peek opens on a page whose own CSP restricts frames, styles and scripts", async ({
    page,
    fixtureServer,
  }, testInfo) => {
    await page.goto(fixtureServer.url("/strict-host.html"));

    await openPeek(page, "#cross-site-link");

    await expect(peekOverlay(page).frame.locator("#peeked-heading")).toBeVisible();
    await expect(peekOverlay(page).pane).toHaveCSS("border-radius", "7px");
    await captureScreenshot(page, testInfo, "strict-host-peek");
  });

  test("links inside the peek still navigate it on a page whose CSP restricts frames", async ({
    page,
    fixtureServer,
  }) => {
    await page.goto(fixtureServer.url("/strict-host.html"));
    await openPeek(page, "#cross-site-link");

    await peekOverlay(page).frame.locator("#in-peek-link").click();

    await expect(peekOverlay(page).frame.locator("#section-1")).toBeVisible();
  });

  test("a frame-busting script cannot navigate the page behind the peek", async ({
    page,
    fixtureServer,
  }) => {
    await page.goto(fixtureServer.url("/links.html"));

    await openPeek(page, "#frame-busting-link");

    await expect(peekOverlay(page).frame.locator("#frame-busting-heading")).toBeVisible();
    await expect(page).toHaveURL(fixtureServer.url("/links.html"));
  });
});

async function framedHeadingCount(page: Page, url: string): Promise<number> {
  await page.evaluate(
    (src) =>
      new Promise<void>((resolve) => {
        const frame = document.createElement("iframe");
        frame.id = "probe-frame";
        frame.addEventListener("load", () => resolve(), { once: true });
        frame.src = src;
        document.body.append(frame);
      }),
    url,
  );
  return page.frameLocator("#probe-frame").locator("#framing-denied-heading").count();
}

test.describe("the page behind a peek", () => {
  test("Back still leaves the page after browsing inside a peek and closing it", async ({
    page,
    fixtureServer,
  }) => {
    await page.goto(fixtureServer.url("/long-page.html"));
    await page.goto(fixtureServer.url("/links.html"));
    await openPeek(page, "#cross-site-link");
    await peekOverlay(page).frame.locator("#in-peek-link").click();
    await expect(peekOverlay(page).frame.locator("#section-1")).toBeVisible();

    await page.keyboard.press("Escape");
    await expectNoPeek(page);
    await page.goBack();

    await expect(page).toHaveURL(fixtureServer.url("/long-page.html"));
  });

  test("Back still leaves the page after browsing inside a peek and expanding it", async ({
    page,
    context,
    fixtureServer,
  }) => {
    await page.goto(fixtureServer.url("/long-page.html"));
    await page.goto(fixtureServer.url("/links.html"));
    await openPeek(page, "#cross-site-link");
    await peekOverlay(page).frame.locator("#in-peek-link").click();
    await expect(peekOverlay(page).frame.locator("#section-1")).toBeVisible();

    const newTab = context.waitForEvent("page");
    await peekOverlay(page).expandButton.click();
    await newTab;
    await expectNoPeek(page);
    await page.goBack();

    await expect(page).toHaveURL(fixtureServer.url("/long-page.html"));
  });

  test("Back stays on the page while the peek is open and goes back inside the peek", async ({
    page,
    fixtureServer,
  }) => {
    await page.goto(fixtureServer.url("/links.html"));
    await openPeek(page, "#cross-site-link");
    await peekOverlay(page).frame.locator("#in-peek-link").click();
    await expect(peekOverlay(page).frame.locator("#section-1")).toBeVisible();

    // The browser's Back button walks the tab's joint history, as history.back() does.
    await page.evaluate(() => history.back());

    await expect(peekOverlay(page).frame.locator("#peeked-heading")).toBeVisible();
    await expect(page).toHaveURL(fixtureServer.url("/links.html"));
    await page.keyboard.press("Escape");
    await expectNoPeek(page);
  });
  test("does not scroll while the peek is open, and scrolls again after", async ({
    page,
    fixtureServer,
  }) => {
    await page.goto(fixtureServer.url("/links.html"));
    await openPeek(page, "#cross-site-link");
    await expect(peekOverlay(page).frame.locator("#peeked-heading")).toBeVisible();

    const peekedFrame = page.frame({ url: fixtureServer.crossSiteUrl("/peeked.html") });
    if (!peekedFrame) throw new Error("The peeked page is not loaded");

    await wheelAt(page, page.mainFrame(), { x: 40, y: 400 });
    await wheelAt(page, peekedFrame, { x: 640, y: 400 });

    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    await page.keyboard.press("Escape");
    await expectNoPeek(page);
    await page.mouse.wheel(0, 800);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });
});

/** Scrolls the wheel over a point and returns once the wheel event reached `frame` and two frames rendered. */
async function wheelAt(page: Page, frame: Frame, point: { x: number; y: number }): Promise<void> {
  const received = frame.evaluate(
    () =>
      new Promise<void>((resolve) => {
        addEventListener("wheel", () => resolve(), { once: true, capture: true });
      }),
  );
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, 1200);
  await received;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

test.describe("appearance", () => {
  test("follows the dark colour scheme", async ({ page, fixtureServer }, testInfo) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(fixtureServer.url("/links.html"));
    await openPeek(page, "#cross-site-link");
    await expect(peekOverlay(page).frame.locator("#peeked-heading")).toBeVisible();

    await expect(peekOverlay(page).closeButton).toHaveCSS("background-color", "rgb(12, 12, 14)");
    await expect(peekOverlay(page).pane).toHaveCSS("background-color", "rgb(0, 0, 0)");
    await captureScreenshot(page, testInfo, "peek-open-dark");
  });

  test("uses the light look by default", async ({ page, fixtureServer }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(fixtureServer.url("/links.html"));
    await openPeek(page, "#cross-site-link");

    await expect(peekOverlay(page).closeButton).toHaveCSS("background-color", "rgb(253, 253, 255)");
    await expect(peekOverlay(page).pane).toHaveCSS("border-radius", "7px");
  });
});
