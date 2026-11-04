import type { Spring } from "./spring.ts";
import { type DurationMs, ms, type PixelLength, px, type Ratio, ratio } from "./units.ts";

/**
 * Every tunable number behind Peek's look and motion, in one place so they can be refitted against a
 * frame-by-frame recording of Arc. Values marked GUESS are not observed from Arc; see
 * wiki/research/arc-peek.md and wiki/decisions/2026-11-04-peek-implementation.md.
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
  /** Pane width as a share of the viewport (measured ≈82 %). */
  paneWidthRatio: ratio(0.82),
  /** GUESS: Arc's maximum pane width is unknown. */
  paneMaxWidth: px(1400),
  /** Gap above and below the pane (measured ≈8 pt). */
  paneVerticalInset: px(8),
  controlDiameter: px(32),
  /** Centre-to-centre distance between stacked controls (measured ≈42 pt). */
  controlPitch: px(42),
  /** Gap between the pane's right edge and the controls rail (measured ≈14 pt). */
  railGapFromPane: px(14),
  /** Controls rail top, below the pane's top edge (measured ≈8 pt). */
  railTopOffset: px(8),
  /** GUESS: when the right gutter is narrower than this margin plus the rail, the rail moves inside the pane. */
  railMinViewportMargin: px(8),
  railInsetInsidePane: px(10),
} as const satisfies Record<string, PixelLength | Ratio>;

export const PEEK_SURFACE = {
  /** Measured ≈6–7 pt. */
  paneCornerRadius: px(7),
  /** Scrim opacity over the page (measured ≈70 %). */
  scrimDim: ratio(0.7),
  /** Arc's scrim shows no blur; kept as a token because most clones add one. */
  scrimBlur: px(0),
} as const satisfies Record<string, PixelLength | Ratio>;

export const PEEK_MOTION = {
  /** GUESS: Arc's presentation spring (response ≈0.38 s, ≈1 % overshoot). */
  openSpring: { response: ms(380), dampingRatio: 0.85 } satisfies Spring,
  /** GUESS: faster and critically damped, so closing never overshoots. */
  closeSpring: { response: ms(220), dampingRatio: 1 } satisfies Spring,
  /** GUESS: grow to fill the viewport before handing over to a real tab. */
  expandSpring: { response: ms(240), dampingRatio: 1 } satisfies Spring,
  /** Distance from the target, as a share of the travel, at which a spring counts as settled. */
  springSettleTolerance: 0.001,

  /** Hides the blank frame while the pane is still tiny. */
  paneFadeIn: { duration: ms(130), delay: ms(0), easing: EASE_OUT } satisfies FadeTiming,
  /** The pane fades over the last part of its flight back to the link. */
  paneFadeOutOnDismiss: { duration: ms(110), delay: ms(0), easing: EASE_IN } satisfies FadeTiming,

  scrimFadeIn: { duration: ms(240), delay: ms(0), easing: EASE_OUT } satisfies FadeTiming,
  scrimFadeOut: { duration: ms(260), delay: ms(0), easing: EASE_OUT } satisfies FadeTiming,

  /** GUESS: controls appear once the pane is most of the way there. */
  controlsAppear: { duration: ms(200), delay: ms(150), easing: EASE_OUT } satisfies FadeTiming,
  controlsAppearFromScale: ratio(0.8),
  controlsDisappear: { duration: ms(100), delay: ms(0), easing: EASE_IN } satisfies FadeTiming,

  /** GUESS: when the link is gone or off-screen the pane shrinks in place and fades instead. */
  dismissInPlaceScale: ratio(0.95),

  /** Clone decision: crossfade only when the user prefers reduced motion. */
  reducedMotionFade: { duration: ms(120), delay: ms(0), easing: EASE_OUT } satisfies FadeTiming,
} as const;

export function cssCubicBezier([x1, y1, x2, y2]: CubicBezierEasing): string {
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
}
