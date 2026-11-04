import type { Spring } from "./spring.ts";
import { type DurationMs, ms, type PixelLength, px, type Ratio, ratio } from "./units.ts";

/**
 * Every tunable number behind Peek's look and motion, in one place. Values marked MEASURED were fitted
 * to a 60 fps screen recording of Arc 1.171 (2026-11-04); see
 * wiki/research/2026-11-04-arc-recording-measurements.md. Values marked GUESS are not observed from Arc.
 */

export type CubicBezierEasing = readonly [x1: number, y1: number, x2: number, y2: number];

export type FadeTiming = {
  readonly duration: DurationMs;
  readonly delay: DurationMs;
  readonly easing: CubicBezierEasing;
};

const EASE_OUT: CubicBezierEasing = [0.25, 0.1, 0.25, 1];
const EASE_IN: CubicBezierEasing = [0.42, 0, 1, 1];

export const PEEK_LAYOUT = {
  /** MEASURED: pane width as a share of the viewport (≈85 % in a ≈2375 pt window), with no maximum. */
  paneWidthRatio: ratio(0.85),
  /** Gap above and below the pane (≈8 pt; consistent with the recording, not directly visible in it). */
  paneVerticalInset: px(8),
  /** MEASURED: 34 pt. */
  controlDiameter: px(34),
  /** MEASURED: centre-to-centre distance between stacked controls, 43 pt. */
  controlPitch: px(43),
  /** MEASURED: gap between the pane's right edge and the controls rail, 13.5–14 pt. */
  railGapFromPane: px(14),
  /** Controls rail top, below the pane's top edge (≈8 pt, from Arc's help-center images). */
  railTopOffset: px(8),
  /** GUESS: when the right gutter is narrower than this margin plus the rail, the rail moves inside the pane. */
  railMinViewportMargin: px(8),
  railInsetInsidePane: px(10),
} as const satisfies Record<string, PixelLength | Ratio>;

export const PEEK_SNAPSHOT = {
  /** Clone decision: rows taller than this (a whole paragraph around an inline link) are not "a row". */
  rowMaxHeight: px(120),
  /** Clone decision: a row with more elements than this is not copied; the link alone is. */
  rowMaxElements: 150,
} as const satisfies Record<string, PixelLength | number>;

export const PEEK_SURFACE = {
  /** Measured ≈5–8 pt in flight; the resting corners were outside the recording. */
  paneCornerRadius: px(7),
  /** MEASURED: scrim opacity over the page, ≈0.6–0.75 (tinted with the Space colour in Arc). */
  scrimDim: ratio(0.7),
  /** MEASURED: Arc's scrim shows no blur; kept as a token because most clones add one. */
  scrimBlur: px(0),
} as const satisfies Record<string, PixelLength | Ratio>;

export const PEEK_MOTION = {
  /** MEASURED: the pane's horizontal edges fit this spring to ±1.3 pt (≈0.7 % overshoot, rests ≈360 ms). */
  openSpring: { response: ms(242), dampingRatio: 0.865 } satisfies Spring,
  /**
   * MEASURED (weak: six frames before the pane's edges leave the recording, and the fit cannot tell
   * damping apart, so Arc's 0.865 is kept): the height follows its own spring, set off 15 ms after the
   * width's, so a wide letterbox opens before the pane gets tall.
   */
  openSpringVertical: { response: ms(235), dampingRatio: 0.865 } satisfies Spring,
  openVerticalLag: ms(15),
  /** MEASURED: critically damped; ≈99 % of the way back into the link after 200 ms. */
  closeSpring: { response: ms(190), dampingRatio: 1 } satisfies Spring,
  /** MEASURED: the bottom edge fits 157 ms critically damped where the right edge fits 194 ms. */
  closeSpringVertical: { response: ms(157), dampingRatio: 1 } satisfies Spring,
  /** GUESS: the recording has no expand. Grow to fill the viewport before handing over to a real tab. */
  expandSpring: { response: ms(240), dampingRatio: 1 } satisfies Spring,
  /**
   * Clone decision: after expanding, the new tab loads in the background behind the expanded Peek and
   * is switched to once loaded, or after this long at most.
   */
  tabHandoverMaxWait: ms(1_000),
  /** Distance from the target, as a share of the travel, at which a spring counts as settled. */
  springSettleTolerance: 0.001,

  /**
   * MEASURED: Arc's pane sets off ≈20 ms after the scrim starts, and flies blank when the page has not
   * painted yet; it does not wait for content.
   */
  paneDeparture: ms(20),
  /** MEASURED: Arc's pane is opaque from its first frame; this only hides the first, link-sized frames. */
  paneFadeIn: { duration: ms(30), delay: ms(0), easing: EASE_OUT } satisfies FadeTiming,
  /** MEASURED: the pane, squashed into a line over the link, is gone ≈200 ms after Esc. */
  paneFadeOutOnDismiss: { duration: ms(70), delay: ms(130), easing: EASE_IN } satisfies FadeTiming,

  /** MEASURED: the enlarged snapshot of the link's row fades out over ≈80 ms from the pane's first frame. */
  snapshotFadeOut: { duration: ms(80), delay: ms(0), easing: EASE_OUT } satisfies FadeTiming,
  /** MEASURED roughly (3835-3952 ms frames): the pane crossfades into the row's snapshot while it shrinks. */
  snapshotFadeIn: { duration: ms(120), delay: ms(20), easing: EASE_IN } satisfies FadeTiming,

  /** MEASURED: 57 % opaque within ≈15 ms, 99 % by 115 ms. */
  scrimFadeIn: {
    duration: ms(117),
    delay: ms(0),
    easing: [0, 0.34, 0, 0.81],
  } satisfies FadeTiming,
  /** MEASURED: starts with the pane's flight back, gone after ≈175 ms. */
  scrimFadeOut: {
    duration: ms(175),
    delay: ms(0),
    easing: [0.37, 0.68, 0.49, 0.92],
  } satisfies FadeTiming,

  /**
   * MEASURED: the rail rides on the pane's top-right corner and shows ≈95 ms into the flight, as it
   * comes out from behind the pane's edge; it is not scaled.
   */
  controlsAppear: { duration: ms(35), delay: ms(95), easing: EASE_OUT } satisfies FadeTiming,
  /** MEASURED: the rail is gone within two frames of Esc. */
  controlsDisappear: { duration: ms(30), delay: ms(0), easing: EASE_IN } satisfies FadeTiming,

  /** GUESS: when the link is gone or off-screen the pane shrinks in place and fades instead. */
  dismissInPlaceScale: ratio(0.95),

  /** Clone decision: crossfade only when the user prefers reduced motion. */
  reducedMotionFade: { duration: ms(120), delay: ms(0), easing: EASE_OUT } satisfies FadeTiming,
} as const;

export function cssCubicBezier([x1, y1, x2, y2]: CubicBezierEasing): string {
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
}
