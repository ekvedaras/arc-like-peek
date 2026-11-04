import {
  type BoxTransform,
  cssTransform,
  IDENTITY_TRANSFORM,
  type Rect,
  scaleAboutCentre,
  transformOnto,
} from "./geometry.ts";
import { cssCubicBezier, type FadeTiming, PEEK_MOTION } from "./motion-tokens.ts";
import { type SpringCurve, springCurve } from "./spring.ts";
import { type DurationMs, ms } from "./units.ts";

/** The animated parts of the overlay. Only `transform` and `opacity` are ever animated. */
export type OverlayPart = "scrim" | "pane" | "page" | "controls";

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

export const PEEK_OPEN_CURVE: SpringCurve = OPEN_CURVE;

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
    spring("pane", from, IDENTITY_TRANSFORM, OPEN_CURVE, "backwards"),
    fade("pane", 0, 1, PEEK_MOTION.paneFadeIn, "backwards"),
    controlsAppear(),
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
 * The pane grows to cover the viewport, then the page it shows is opened as a tab. The page inside
 * is counter-scaled so it keeps its proportions instead of stretching with the pane.
 */
export function expandChoreography(
  pane: Rect,
  viewport: Rect,
  motion: MotionPreference,
): readonly MotionStep[] {
  if (motion === "reduced") return crossfadeOut();

  const growth = transformOnto(pane, viewport);
  const counterScale: BoxTransform = {
    translateX: 0,
    translateY: 0,
    scaleX: 1 / growth.scaleX,
    scaleY: 1 / growth.scaleY,
  };
  return [
    fadeTo("scrim", 0, PEEK_MOTION.scrimFadeOut),
    springTo("pane", growth, EXPAND_CURVE),
    springTo("page", counterScale, EXPAND_CURVE),
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

function controlsAppear(): MotionStep {
  const timing = PEEK_MOTION.controlsAppear;
  const fromScale = PEEK_MOTION.controlsAppearFromScale;
  return {
    part: "controls",
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
