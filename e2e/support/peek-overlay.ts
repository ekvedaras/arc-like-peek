import { expect, type Locator, type Page } from "@playwright/test";

/** Selectors for the Peek overlay. Playwright and the animation tracer both pierce its open shadow root. */
export const PEEK_SELECTORS = {
  host: "arc-like-peek",
  scrim: ".peek-scrim",
  pane: ".peek-pane",
  controls: ".peek-controls",
  frame: ".peek-page",
} as const;

export type PeekPhase = "opening" | "open" | "closing" | "expanding";

export function peekOverlay(page: Page) {
  return {
    host: page.locator(PEEK_SELECTORS.host),
    scrim: page.locator(PEEK_SELECTORS.scrim),
    pane: page.locator(PEEK_SELECTORS.pane),
    controls: page.locator(PEEK_SELECTORS.controls),
    closeButton: page.locator('.peek-control[data-control="close"]'),
    expandButton: page.locator('.peek-control[data-control="expand"]'),
    frame: page.frameLocator(PEEK_SELECTORS.frame),
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
