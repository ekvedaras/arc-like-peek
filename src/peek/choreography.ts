import {
  type BoxTransform,
  cssTransform,
  IDENTITY_TRANSFORM,
  interpolateTransform,
  pinnedToViewport,
  type Rect,
  scaleAboutCentre,
  transformOnto,
} from "./geometry.ts";
import { cssCubicBezier, type FadeTiming, PEEK_MOTION } from "./motion-tokens.ts";
import { type SpringCurve, springCurve } from "./spring.ts";
import { type DurationMs, ms } from "./units.ts";

/** The animated parts of the overlay. Only `transform` and `opacity` are ever animated. */
export type OverlayPart = "scrim" | "pane" | "page" | "controls";

/**
 * When a step may start. The pane holds until the peeked page has painted (or the wait runs out),
 * so it does not fly as an empty card; see `PEEK_MOTION.firstPaintWait`.
 */
export type MotionCue = "atOnce" | "oncePagePainted";

export type MotionStep = {
  readonly part: OverlayPart;
  readonly cue: MotionCue;
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

export const PEEK_OPEN_CURVE: SpringCurve = OPEN_CURVE;
export const PEEK_EXPAND_CURVE: SpringCurve = EXPAND_CURVE;

/** Enough samples of the expand spring that the page held inside the pane moves by under a pixel. */
const EXPAND_KEYFRAMES = 32;

/** The pane grows out of the link while the scrim fades in, then the controls pop in. */
export function openChoreography(
  pane: Rect,
  origin: Rect | null,
  motion: MotionPreference,
): readonly MotionStep[] {
  if (motion === "reduced" || origin === null) return crossfadeIn();

  const from = transformOnto(pane, origin);
  return [
    fade("scrim", 0, 1, PEEK_MOTION.scrimFadeIn, "backwards"),
    oncePagePainted(spring("pane", from, IDENTITY_TRANSFORM, OPEN_CURVE, "backwards")),
    oncePagePainted(fade("pane", 0, 1, PEEK_MOTION.paneFadeIn, "backwards")),
    oncePagePainted(controlsAppear()),
  ];
}

/**
 * The pane flies back into the link it came from and fades at the very end; without a visible
 * link it shrinks in place. Starts from the current state, so it can interrupt opening.
 */
export function dismissChoreography(
  pane: Rect,
  origin: Rect | null,
  motion: MotionPreference,
): readonly MotionStep[] {
  if (motion === "reduced") return crossfadeOut();

  const to = origin
    ? transformOnto(pane, origin)
    : scaleAboutCentre(pane, PEEK_MOTION.dismissInPlaceScale);
  const curve = CLOSE_CURVE;
  const fadeOut = PEEK_MOTION.paneFadeOutOnDismiss;
  const fadeOutAtEnd: FadeTiming = {
    ...fadeOut,
    delay: ms(Math.max(0, curve.duration - fadeOut.duration)),
  };
  return [
    fadeTo("scrim", 0, PEEK_MOTION.scrimFadeOut),
    springTo("pane", to, curve),
    fadeTo("pane", 0, origin ? fadeOutAtEnd : { ...fadeOut, duration: curve.duration }),
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
      cue: "atOnce",
      keyframes: moments.map(({ offset, pane: transform }) => ({
        offset,
        transform: cssTransform(transform),
      })),
      timing,
    },
    {
      part: "page",
      cue: "atOnce",
      keyframes: moments.map(({ offset, pane: transform }) => ({
        offset,
        transform: cssTransform(pinnedToViewport(pane, viewport, transform)),
      })),
      timing,
    },
    // A separate animation, so the transforms above stay on the compositor.
    {
      part: "pane",
      cue: "atOnce",
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
    oncePagePainted(fade("pane", 0, 1, timing, "backwards")),
    oncePagePainted(fade("controls", 0, 1, timing, "backwards")),
  ];
}

function crossfadeOut(): readonly MotionStep[] {
  const timing = PEEK_MOTION.reducedMotionFade;
  return [fadeTo("scrim", 0, timing), fadeTo("pane", 0, timing), fadeTo("controls", 0, timing)];
}

function oncePagePainted(step: MotionStep): MotionStep {
  return { ...step, cue: "oncePagePainted" };
}

function controlsAppear(): MotionStep {
  const timing = PEEK_MOTION.controlsAppear;
  const fromScale = PEEK_MOTION.controlsAppearFromScale;
  return {
    part: "controls",
    cue: "atOnce",
    keyframes: [
      { opacity: 0, transform: `scale(${fromScale})` },
      { opacity: 1, transform: "scale(1)" },
    ],
    timing: {
      duration: timing.duration,
      delay: timing.delay,
      easing: cssCubicBezier(timing.easing),
      fill: "backwards",
    },
  };
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
    cue: "atOnce",
    keyframes: [{ transform: cssTransform(from) }, { transform: cssTransform(to) }],
    timing: { duration: curve.duration, delay: ms(0), easing: curve.cssEasing, fill },
  };
}

function springTo(part: OverlayPart, to: BoxTransform, curve: SpringCurve): MotionStep {
  return {
    part,
    cue: "atOnce",
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
    cue: "atOnce",
    keyframes: [{ opacity: from }, { opacity: to }],
    timing: { ...timing, easing: cssCubicBezier(timing.easing), fill },
  };
}

function fadeTo(part: OverlayPart, to: number, timing: FadeTiming): MotionStep {
  return {
    part,
    cue: "atOnce",
    keyframes: [{ opacity: to }],
    timing: { ...timing, easing: cssCubicBezier(timing.easing), fill: "forwards" },
  };
}
