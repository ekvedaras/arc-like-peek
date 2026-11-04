import { type DurationMs, ms } from "./units.ts";

/**
 * A spring in SwiftUI's terms, which is how Arc parameterises Peek's motion:
 * `response` is the period of the undamped oscillation, `dampingRatio` 1 is critically damped.
 */
export type Spring = {
  readonly response: DurationMs;
  readonly dampingRatio: number;
};

export type SpringCurve = {
  /** Time until the spring stays within the settle tolerance of its target. */
  readonly duration: DurationMs;
  /** Progress (0 → 1, may overshoot) at a normalised time in [0, 1] of `duration`. */
  readonly progressAt: (normalisedTime: number) => number;
  /** The same curve as a CSS `linear()` easing, to run on the compositor. */
  readonly cssEasing: string;
};

const SETTLE_SEARCH_LIMIT_MS = 5_000;
const CSS_EASING_POINTS = 64;

export function springCurve(spring: Spring, settleTolerance: number): SpringCurve {
  if (!(spring.dampingRatio > 0)) throw new RangeError("A spring needs a positive damping ratio");
  if (!(spring.response > 0)) throw new RangeError("A spring needs a positive response");

  const position = springPosition(spring);
  const duration = settleDuration(position, settleTolerance);
  const progressAt = (normalisedTime: number): number => {
    if (normalisedTime >= 1) return 1;
    return position(Math.max(0, normalisedTime) * duration);
  };
  return { duration, progressAt, cssEasing: cssLinearEasing(progressAt) };
}

/** Position over time (ms) of a spring released at rest from 0 towards 1. */
function springPosition({ response, dampingRatio }: Spring): (timeMs: number) => number {
  const naturalFrequency = (2 * Math.PI) / (response / 1_000);
  const decay = dampingRatio * naturalFrequency;

  if (dampingRatio < 1) {
    const dampedFrequency = naturalFrequency * Math.sqrt(1 - dampingRatio ** 2);
    return (timeMs) => {
      const t = timeMs / 1_000;
      return (
        1 -
        Math.exp(-decay * t) *
          (Math.cos(dampedFrequency * t) +
            (decay / dampedFrequency) * Math.sin(dampedFrequency * t))
      );
    };
  }

  if (dampingRatio === 1) {
    return (timeMs) => {
      const t = timeMs / 1_000;
      return 1 - Math.exp(-naturalFrequency * t) * (1 + naturalFrequency * t);
    };
  }

  const spread = naturalFrequency * Math.sqrt(dampingRatio ** 2 - 1);
  const slowRoot = -decay + spread;
  const fastRoot = -decay - spread;
  return (timeMs) => {
    const t = timeMs / 1_000;
    return (
      1 -
      (fastRoot * Math.exp(slowRoot * t) - slowRoot * Math.exp(fastRoot * t)) /
        (fastRoot - slowRoot)
    );
  };
}

function settleDuration(position: (timeMs: number) => number, tolerance: number): DurationMs {
  let lastOutsideTolerance = 0;
  for (let timeMs = 0; timeMs <= SETTLE_SEARCH_LIMIT_MS; timeMs++) {
    if (Math.abs(1 - position(timeMs)) > tolerance) lastOutsideTolerance = timeMs;
  }
  return ms(lastOutsideTolerance + 1);
}

function cssLinearEasing(progressAt: (normalisedTime: number) => number): string {
  const stops = Array.from({ length: CSS_EASING_POINTS + 1 }, (_, index) =>
    index === CSS_EASING_POINTS ? 1 : roundTo(progressAt(index / CSS_EASING_POINTS), 4),
  );
  return `linear(${stops.join(", ")})`;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
