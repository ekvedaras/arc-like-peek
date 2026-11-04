import { describe, expect, test } from "bun:test";
import { type CubicBezierEasing, type FadeTiming, PEEK_MOTION } from "./motion-tokens.ts";
import { type Spring, springCurve } from "./spring.ts";
import { ms } from "./units.ts";

/**
 * Normalised progress of Arc's Peek, measured frame by frame from a 60 fps recording of Arc 1.171
 * (wiki/research/2026-11-04-arc-recording-measurements.md): [ms after the motion starts, progress].
 * Start times and the pane's start edge are those of the best fit; 60 fps frames leave ±8 ms of jitter.
 */
const ARC_OPEN_PANE: readonly (readonly [number, number])[] = [
  [29, 0.183],
  [46, 0.36],
  [63, 0.525],
  [79, 0.665],
  [96, 0.774],
  [113, 0.855],
  [129, 0.912],
  [146, 0.95],
  [163, 0.975],
  [179, 0.99],
  [196, 0.998],
  [229, 1.005],
  [263, 1.004],
  [313, 1.002],
  [363, 1],
];
/**
 * The pane's height, from the rects measured at 918-1002 ms (top and bottom edges), as progress from the
 * link's 20 pt line to the resting height (1313 pt), against ms after the pane's horizontal departure
 * (889 ms). Only these six frames show the height before it leaves the recording.
 */
const ARC_OPEN_PANE_HEIGHT: readonly (readonly [number, number])[] = [
  [29, 0.08],
  [46, 0.201],
  [63, 0.359],
  [79, 0.526],
  [96, 0.678],
  [113, 0.804],
];
const ARC_CLOSE_PANE: readonly (readonly [number, number])[] = [
  [25, 0.212],
  [42, 0.394],
  [75, 0.695],
  [92, 0.797],
  [108, 0.87],
  [125, 0.92],
  [142, 0.953],
  [158, 0.973],
  [175, 0.985],
];
const ARC_SCRIM_IN: readonly (readonly [number, number])[] = [
  [15, 0.569],
  [32, 0.701],
  [48, 0.802],
  [65, 0.883],
  [82, 0.93],
  [98, 0.969],
  [115, 0.991],
];
const ARC_SCRIM_OUT_REMAINING: readonly (readonly [number, number])[] = [
  [17, 0.81],
  [34, 0.651],
  [67, 0.342],
  [84, 0.244],
  [100, 0.147],
  [117, 0.108],
  [134, 0.057],
  [150, 0.018],
  [167, 0.01],
];

function springProgressAt(spring: Spring, elapsedMs: number): number {
  const curve = springCurve(spring, PEEK_MOTION.springSettleTolerance);
  return curve.progressAt(elapsedMs / curve.duration);
}

/** CSS `cubic-bezier()` progress at `time`, found by bisecting the curve's x. */
function cubicBezierProgress([x1, y1, x2, y2]: CubicBezierEasing, time: number): number {
  const coordinate = (t: number, p1: number, p2: number): number =>
    3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3;
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 50; iteration++) {
    const middle = (low + high) / 2;
    if (coordinate(middle, x1, x2) < time) low = middle;
    else high = middle;
  }
  return coordinate((low + high) / 2, y1, y2);
}

function fadeProgressAt({ duration, delay, easing }: FadeTiming, elapsedMs: number): number {
  const time = Math.min(1, Math.max(0, (elapsedMs - delay) / duration));
  return cubicBezierProgress(easing, time);
}

function largestMiss(
  samples: readonly (readonly [number, number])[],
  progressAt: (elapsedMs: number) => number,
): number {
  return Math.max(...samples.map(([elapsedMs, arc]) => Math.abs(progressAt(elapsedMs) - arc)));
}

describe("the motion follows Arc's recorded Peek", () => {
  test("the pane opens on Arc's spring", () => {
    expect(
      largestMiss(ARC_OPEN_PANE, (t) => springProgressAt(PEEK_MOTION.openSpring, t)),
    ).toBeLessThan(0.03);
  });

  test("the pane's height follows its own, later spring (weaker data: six frames, within 0.05)", () => {
    const heightAt = (t: number): number =>
      springProgressAt(PEEK_MOTION.openSpringVertical, t - PEEK_MOTION.openVerticalLag);

    expect(largestMiss(ARC_OPEN_PANE_HEIGHT, heightAt)).toBeLessThan(0.05);
  });

  test("the height lags the width at every frame Arc's height was seen, as in Arc", () => {
    for (const [elapsedMs, arcHeight] of ARC_OPEN_PANE_HEIGHT) {
      const arcWidth = ARC_OPEN_PANE.find(([each]) => each === elapsedMs)?.[1] ?? 0;
      const ourWidth = springProgressAt(PEEK_MOTION.openSpring, elapsedMs);
      const ourHeight = springProgressAt(
        PEEK_MOTION.openSpringVertical,
        elapsedMs - PEEK_MOTION.openVerticalLag,
      );
      expect(arcHeight).toBeLessThan(arcWidth);
      expect(ourHeight).toBeLessThan(ourWidth);
    }
  });

  test("the pane closes on Arc's spring", () => {
    expect(
      largestMiss(ARC_CLOSE_PANE, (t) => springProgressAt(PEEK_MOTION.closeSpring, t)),
    ).toBeLessThan(0.03);
  });

  test("the pane's bottom edge closes faster than its right edge, as Arc's does", () => {
    const vertical = springCurve(
      PEEK_MOTION.closeSpringVertical,
      PEEK_MOTION.springSettleTolerance,
    );
    const horizontal = springCurve(PEEK_MOTION.closeSpring, PEEK_MOTION.springSettleTolerance);

    expect(PEEK_MOTION.closeSpringVertical.response).toBe(ms(157));
    expect(vertical.duration).toBeLessThan(horizontal.duration);
  });

  test("the scrim fades in and out like Arc's", () => {
    expect(
      largestMiss(ARC_SCRIM_IN, (t) => fadeProgressAt(PEEK_MOTION.scrimFadeIn, t)),
    ).toBeLessThan(0.03);
    expect(
      largestMiss(ARC_SCRIM_OUT_REMAINING, (t) => 1 - fadeProgressAt(PEEK_MOTION.scrimFadeOut, t)),
    ).toBeLessThan(0.03);
  });
});
