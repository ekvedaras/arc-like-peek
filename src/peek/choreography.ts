import {
  type BoxTransform,
  collapsedLine,
  cssTransform,
  IDENTITY_TRANSFORM,
  interpolateTransform,
  type PeekOriginShape,
  pinnedToViewport,
  type Rect,
  scaleAboutCentre,
  transformOnto,
} from "./geometry.ts";
import { cssCubicBezier, type FadeTiming, PEEK_MOTION } from "./motion-tokens.ts";
import { type SpringCurve, springCurve } from "./spring.ts";
import { type DurationMs, ms } from "./units.ts";

/** The animated parts of the overlay. Only `transform` and `opacity` are ever animated. */
export type OverlayPart = "scrim" | "pane" | "page" | "controls" | "snapshot";

export type MotionStep = {
  readonly part: OverlayPart;
  /** Keyframes without a starting value continue from wherever the part currently is. */
  readonly keyframes: readonly Keyframe[];
  readonly timing: {
    readonly duration: DurationMs;
    readonly delay: DurationMs;
    readonly easing: string;
    readonly fill: FillMode;
  };
};

export type MotionPreference = "full" | "reduced";

const OPEN_CURVE = springCurve(PEEK_MOTION.openSpring, PEEK_MOTION.springSettleTolerance);
const CLOSE_CURVE = springCurve(PEEK_MOTION.closeSpring, PEEK_MOTION.springSettleTolerance);
const EXPAND_CURVE = springCurve(PEEK_MOTION.expandSpring, PEEK_MOTION.springSettleTolerance);
const OPEN_VERTICAL_CURVE = springCurve(
  PEEK_MOTION.openSpringVertical,
  PEEK_MOTION.springSettleTolerance,
);
const CLOSE_VERTICAL_CURVE = springCurve(
  PEEK_MOTION.closeSpringVertical,
  PEEK_MOTION.springSettleTolerance,
);

/** A spring for one axis of the pane, set off `lag` after the flight starts. */
type AxisSpring = { readonly curve: SpringCurve; readonly lag: DurationMs };

const OPEN_HORIZONTAL: AxisSpring = { curve: OPEN_CURVE, lag: ms(0) };
const OPEN_VERTICAL: AxisSpring = {
  curve: OPEN_VERTICAL_CURVE,
  lag: PEEK_MOTION.openVerticalLag,
};
const CLOSE_HORIZONTAL: AxisSpring = { curve: CLOSE_CURVE, lag: ms(0) };
const CLOSE_VERTICAL: AxisSpring = { curve: CLOSE_VERTICAL_CURVE, lag: ms(0) };

/** One sample per frame at 120 Hz is plenty for a transform that is only ever blended linearly. */
const FLIGHT_SAMPLE_INTERVAL_MS = 8;

export const PEEK_OPEN_CURVE: SpringCurve = OPEN_CURVE;
export const PEEK_EXPAND_CURVE: SpringCurve = EXPAND_CURVE;

/** Enough samples of the expand spring that the page held inside the pane moves by under a pixel. */
const EXPAND_KEYFRAMES = 32;

/** The pane grows out of the link while the scrim fades in, then the controls pop in. */
export function openChoreography(
  pane: Rect,
  origin: PeekOriginShape | null,
  motion: MotionPreference,
): readonly MotionStep[] {
  if (motion === "reduced" || origin === null) return crossfadeIn();

  const from = transformOnto(pane, origin.link);
  return [
    fade("scrim", 0, 1, PEEK_MOTION.scrimFadeIn, "backwards"),
    ...[
      flight("pane", from, IDENTITY_TRANSFORM, OPEN_HORIZONTAL, OPEN_VERTICAL, "backwards"),
      fade("pane", 0, 1, PEEK_MOTION.paneFadeIn, "backwards"),
      ...(origin.hasRowSnapshot
        ? [fade("snapshot", 1, 0, PEEK_MOTION.snapshotFadeOut, "both")]
        : []),
      ...controlsAppear(pane, origin.link),
    ].map(afterPaneDeparture),
  ];
}

/**
 * The pane flies back into the link it came from and fades as it gets there; without a visible
 * link it shrinks in place. Starts from the current state, so it can interrupt opening.
 */
export function dismissChoreography(
  pane: Rect,
  origin: PeekOriginShape | null,
  paneNow: BoxTransform,
  motion: MotionPreference,
): readonly MotionStep[] {
  if (motion === "reduced") return crossfadeOut();

  const fadeOut = PEEK_MOTION.paneFadeOutOnDismiss;
  if (origin === null) {
    const to = scaleAboutCentre(pane, PEEK_MOTION.dismissInPlaceScale);
    return [
      fadeTo("scrim", 0, PEEK_MOTION.scrimFadeOut),
      springTo("pane", to, CLOSE_CURVE),
      fadeTo("pane", 0, { ...fadeOut, delay: ms(0), duration: CLOSE_CURVE.duration }),
      fadeTo("controls", 0, PEEK_MOTION.controlsDisappear),
    ];
  }

  const to = transformOnto(pane, collapsedLine(origin));
  return [
    fadeTo("scrim", 0, PEEK_MOTION.scrimFadeOut),
    flight("pane", paneNow, to, CLOSE_HORIZONTAL, CLOSE_VERTICAL, "forwards"),
    fadeTo("pane", 0, fadeOut),
    ...(origin.hasRowSnapshot ? [fadeTo("snapshot", 1, PEEK_MOTION.snapshotFadeIn)] : []),
    fadeTo("controls", 0, PEEK_MOTION.controlsDisappear),
  ];
}

/**
 * The pane grows from where it is now to cover the viewport, like a window opening onto the tab it
 * becomes: the page inside is already laid out over the whole viewport (see `viewportWithinPane`)
 * and is held still on screen while the pane uncovers it, so nothing reflows or stretches.
 */
export function expandChoreography(
  pane: Rect,
  viewport: Rect,
  paneNow: BoxTransform,
  motion: MotionPreference,
): readonly MotionStep[] {
  if (motion === "reduced") return crossfadeOut();

  const growth = transformOnto(pane, viewport);
  // Holding the page still needs the exact inverse of the pane at every moment, which two
  // interpolated keyframes cannot express, so both follow the spring through the same samples.
  const moments = Array.from({ length: EXPAND_KEYFRAMES + 1 }, (_, index) => {
    const offset = index / EXPAND_KEYFRAMES;
    return { offset, pane: interpolateTransform(paneNow, growth, EXPAND_CURVE.progressAt(offset)) };
  });
  const timing = {
    duration: EXPAND_CURVE.duration,
    delay: ms(0),
    easing: "linear",
    fill: "forwards",
  } as const;
  return [
    fadeTo("scrim", 0, PEEK_MOTION.scrimFadeOut),
    {
      part: "pane",
      keyframes: moments.map(({ offset, pane: transform }) => ({
        offset,
        transform: cssTransform(transform),
      })),
      timing,
    },
    {
      part: "page",
      keyframes: moments.map(({ offset, pane: transform }) => ({
        offset,
        transform: cssTransform(pinnedToViewport(pane, viewport, transform)),
      })),
      timing,
    },
    // A separate animation, so the transforms above stay on the compositor.
    {
      part: "pane",
      keyframes: [{ borderRadius: "0px" }],
      timing: { ...timing, easing: EXPAND_CURVE.cssEasing },
    },
    fadeTo("controls", 0, PEEK_MOTION.controlsDisappear),
  ];
}

function crossfadeIn(): readonly MotionStep[] {
  const timing = PEEK_MOTION.reducedMotionFade;
  return [
    fade("scrim", 0, 1, timing, "backwards"),
    fade("pane", 0, 1, timing, "backwards"),
    fade("controls", 0, 1, timing, "backwards"),
  ];
}

function crossfadeOut(): readonly MotionStep[] {
  const timing = PEEK_MOTION.reducedMotionFade;
  return [fadeTo("scrim", 0, timing), fadeTo("pane", 0, timing), fadeTo("controls", 0, timing)];
}

/** Arc's pane sets off just after the scrim, blank if the page has not painted yet. */
function afterPaneDeparture(step: MotionStep): MotionStep {
  return {
    ...step,
    timing: { ...step.timing, delay: ms(step.timing.delay + PEEK_MOTION.paneDeparture) },
  };
}

/**
 * The rail rides on the pane's top-right corner, so it follows the pane's spring from the link's corner
 * to its place, and shows only once the pane is most of the way there.
 */
function controlsAppear(pane: Rect, origin: Rect): readonly MotionStep[] {
  const fromCorner = {
    translateX: origin.x + origin.width - (pane.x + pane.width),
    translateY: origin.y - pane.y,
    scaleX: 1,
    scaleY: 1,
  };
  return [
    spring("controls", fromCorner, IDENTITY_TRANSFORM, OPEN_CURVE, "backwards"),
    fade("controls", 0, 1, PEEK_MOTION.controlsAppear, "backwards"),
  ];
}

/**
 * The pane's flight with a spring of its own on each axis: sampled, since one pair of keyframes
 * cannot carry two curves. Each axis moves its translation and scale together on its own progress.
 */
function flight(
  part: OverlayPart,
  from: BoxTransform,
  to: BoxTransform,
  horizontal: AxisSpring,
  vertical: AxisSpring,
  fill: FillMode,
): MotionStep {
  const duration = ms(
    Math.max(horizontal.lag + horizontal.curve.duration, vertical.lag + vertical.curve.duration),
  );
  const intervals = Math.ceil(duration / FLIGHT_SAMPLE_INTERVAL_MS);
  const progressOf = ({ curve, lag }: AxisSpring, elapsedMs: number): number =>
    elapsedMs <= lag ? 0 : curve.progressAt((elapsedMs - lag) / curve.duration);
  const keyframes = Array.from({ length: intervals + 1 }, (_, index) => {
    const offset = index / intervals;
    const elapsedMs = offset * duration;
    const x = progressOf(horizontal, elapsedMs);
    const y = progressOf(vertical, elapsedMs);
    const between = (start: number, end: number, progress: number): number =>
      start + (end - start) * progress;
    return {
      offset,
      transform: cssTransform({
        translateX: between(from.translateX, to.translateX, x),
        translateY: between(from.translateY, to.translateY, y),
        scaleX: between(from.scaleX, to.scaleX, x),
        scaleY: between(from.scaleY, to.scaleY, y),
      }),
    };
  });
  return { part, keyframes, timing: { duration, delay: ms(0), easing: "linear", fill } };
}

function spring(
  part: OverlayPart,
  from: BoxTransform,
  to: BoxTransform,
  curve: SpringCurve,
  fill: FillMode,
): MotionStep {
  return {
    part,
    keyframes: [{ transform: cssTransform(from) }, { transform: cssTransform(to) }],
    timing: { duration: curve.duration, delay: ms(0), easing: curve.cssEasing, fill },
  };
}

function springTo(part: OverlayPart, to: BoxTransform, curve: SpringCurve): MotionStep {
  return {
    part,
    keyframes: [{ transform: cssTransform(to) }],
    timing: { duration: curve.duration, delay: ms(0), easing: curve.cssEasing, fill: "forwards" },
  };
}

function fade(
  part: OverlayPart,
  from: number,
  to: number,
  timing: FadeTiming,
  fill: FillMode,
): MotionStep {
  return {
    part,
    keyframes: [{ opacity: from }, { opacity: to }],
    timing: { ...timing, easing: cssCubicBezier(timing.easing), fill },
  };
}

function fadeTo(part: OverlayPart, to: number, timing: FadeTiming): MotionStep {
  return {
    part,
    keyframes: [{ opacity: to }],
    timing: { ...timing, easing: cssCubicBezier(timing.easing), fill: "forwards" },
  };
}
