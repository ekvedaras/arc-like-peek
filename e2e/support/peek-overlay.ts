import { expect, type Locator, type Page } from "@playwright/test";

/** Selectors for the Peek overlay. Playwright and the animation tracer both pierce its open shadow root. */
export const PEEK_SELECTORS = {
  host: "arc-like-peek",
  scrim: ".peek-scrim",
  pane: ".peek-pane",
  controls: ".peek-controls",
  snapshot: ".peek-snapshot",
  /**
   * The Peek's frame. It shows a page of the page behind's own site itself, and any other page
   * through the Peek window, an extension page that frames the peeked page.
   */
  frame: ".peek-page",
  peekedPage: "iframe",
} as const;

export type PeekPhase = "opening" | "open" | "closing" | "expanding";

export function peekOverlay(page: Page) {
  return {
    host: page.locator(PEEK_SELECTORS.host),
    scrim: page.locator(PEEK_SELECTORS.scrim),
    pane: page.locator(PEEK_SELECTORS.pane),
    controls: page.locator(PEEK_SELECTORS.controls),
    snapshot: page.locator(PEEK_SELECTORS.snapshot),
    closeButton: page.locator('.peek-control[data-control="close"]'),
    expandButton: page.locator('.peek-control[data-control="expand"]'),
    /** A peeked page of another site, framed by the Peek window. */
    frame: page.frameLocator(PEEK_SELECTORS.frame).frameLocator(PEEK_SELECTORS.peekedPage),
    /** A peeked page of the page behind's own site, framed by that page. */
    sameSiteFrame: page.frameLocator(PEEK_SELECTORS.frame),
  };
}

export async function expectPeekPhase(page: Page, phase: PeekPhase): Promise<void> {
  await expect(peekOverlay(page).host).toHaveAttribute("data-peek-phase", phase);
}

export async function expectNoPeek(page: Page): Promise<void> {
  await expect(peekOverlay(page).host).toHaveCount(0);
}

export async function rectOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Element has no layout box");
  return box;
}
