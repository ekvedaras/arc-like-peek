import { PEEK_LAYOUT } from "./motion-tokens.ts";

export type Rect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type ViewportSize = { readonly width: number; readonly height: number };

export type Point = { readonly x: number; readonly y: number };

export type ControlsRailPlacement = {
  readonly position: "besidePane" | "insidePane";
  readonly x: number;
  readonly y: number;
};

export type PeekLayout = {
  readonly pane: Rect;
  readonly controlsRail: ControlsRailPlacement;
};

/**
 * A translate + scale applied with `transform-origin: 0 0`, so a box drawn at some rect
 * visually occupies another one.
 */
export type BoxTransform = {
  readonly translateX: number;
  readonly translateY: number;
  readonly scaleX: number;
  readonly scaleY: number;
};

export const IDENTITY_TRANSFORM: BoxTransform = {
  translateX: 0,
  translateY: 0,
  scaleX: 1,
  scaleY: 1,
};

export function peekLayout(viewport: ViewportSize): PeekLayout {
  const width = viewport.width * PEEK_LAYOUT.paneWidthRatio;
  const height = Math.max(0, viewport.height - 2 * PEEK_LAYOUT.paneVerticalInset);
  const pane: Rect = {
    x: (viewport.width - width) / 2,
    y: PEEK_LAYOUT.paneVerticalInset,
    width,
    height,
  };
  return { pane, controlsRail: controlsRailPlacement(viewport, pane) };
}

function controlsRailPlacement(viewport: ViewportSize, pane: Rect): ControlsRailPlacement {
  const besidePaneX = pane.x + pane.width + PEEK_LAYOUT.railGapFromPane;
  const fitsBesidePane =
    besidePaneX + PEEK_LAYOUT.controlDiameter + PEEK_LAYOUT.railMinViewportMargin <= viewport.width;
  if (fitsBesidePane) {
    return { position: "besidePane", x: besidePaneX, y: pane.y + PEEK_LAYOUT.railTopOffset };
  }
  return {
    position: "insidePane",
    x: pane.x + pane.width - PEEK_LAYOUT.railInsetInsidePane - PEEK_LAYOUT.controlDiameter,
    y: pane.y + PEEK_LAYOUT.railInsetInsidePane,
  };
}

/** The transform that makes a box laid out at `box` appear exactly over `target`. */
export function transformOnto(box: Rect, target: Rect): BoxTransform {
  return {
    translateX: target.x - box.x,
    translateY: target.y - box.y,
    scaleX: target.width / box.width,
    scaleY: target.height / box.height,
  };
}

/** `from` moved `progress` of the way to `to`; progress may overshoot 1 for springs. */
export function interpolateTransform(
  from: BoxTransform,
  to: BoxTransform,
  progress: number,
): BoxTransform {
  const between = (start: number, end: number): number => start + (end - start) * progress;
  return {
    translateX: between(from.translateX, to.translateX),
    translateY: between(from.translateY, to.translateY),
    scaleX: between(from.scaleX, to.scaleX),
    scaleY: between(from.scaleY, to.scaleY),
  };
}

/** Where a box covering the whole viewport sits inside the pane, in the pane's own coordinates. */
export function viewportWithinPane(pane: Rect, viewport: Rect): Rect {
  return {
    x: viewport.x - pane.x,
    y: viewport.y - pane.y,
    width: viewport.width,
    height: viewport.height,
  };
}

/**
 * The transform that holds a box laid out at `viewportWithinPane` exactly over the viewport while
 * the pane around it wears `paneTransform`: the pane moves and grows, its content stays put.
 */
export function pinnedToViewport(
  pane: Rect,
  viewport: Rect,
  paneTransform: BoxTransform,
): BoxTransform {
  const offsetX = viewport.x - pane.x;
  const offsetY = viewport.y - pane.y;
  return {
    translateX: (offsetX - paneTransform.translateX) / paneTransform.scaleX - offsetX,
    translateY: (offsetY - paneTransform.translateY) / paneTransform.scaleY - offsetY,
    scaleX: 1 / paneTransform.scaleX,
    scaleY: 1 / paneTransform.scaleY,
  };
}

/** The transform that scales a box laid out at `box` by `factor` around its own centre. */
export function scaleAboutCentre(box: Rect, factor: number): BoxTransform {
  return {
    translateX: (box.width * (1 - factor)) / 2,
    translateY: (box.height * (1 - factor)) / 2,
    scaleX: factor,
    scaleY: factor,
  };
}

export function cssTransform({ translateX, translateY, scaleX, scaleY }: BoxTransform): string {
  return `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`;
}

/**
 * Where a Peek grows from: the line box of the link under the pointer (links wrap over several
 * lines), or the whole link when the pointer is unknown. Null when nothing visible is left to grow
 * from, e.g. the link was removed or scrolled out of view.
 */
export function peekOriginRect(
  linkBoxes: readonly Rect[],
  pointer: Point | null,
  viewport: ViewportSize,
): Rect | null {
  const visibleBoxes = linkBoxes.filter(
    (box) => box.width > 0 && box.height > 0 && intersectsViewport(box, viewport),
  );
  const underPointer = pointer
    ? visibleBoxes.find((box) => containsPoint(box, pointer))
    : undefined;
  return underPointer ?? boundingRect(visibleBoxes);
}

function intersectsViewport(box: Rect, viewport: ViewportSize): boolean {
  return (
    box.x < viewport.width &&
    box.y < viewport.height &&
    box.x + box.width > 0 &&
    box.y + box.height > 0
  );
}

function containsPoint(box: Rect, point: Point): boolean {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  );
}

function boundingRect(boxes: readonly Rect[]): Rect | null {
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
