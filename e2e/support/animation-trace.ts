import type { Page } from "@playwright/test";

export type AnimationSample = {
  readonly elapsedMs: number;
  readonly isPresent: boolean;
  readonly opacity: number;
  readonly transform: string;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly rect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
};

export type NumericSampleProperty = "opacity" | "scaleX" | "scaleY" | "translateX" | "translateY";

type TraceRequest = { readonly selector: string; readonly slot: string };

const TRACE_SLOT = "__arcLikePeekAnimationTrace";

/**
 * Samples the element every animation frame while `action` runs and for `durationMs` after it
 * returns, so curves can be asserted numerically. The selector pierces open shadow roots; the
 * element may appear only after `action` starts.
 *
 * Times are on the page's animation clock (the `requestAnimationFrame` timestamp, which is
 * `document.timeline` time), so they stay meaningful when animations are slowed through CDP.
 */
export async function traceAnimation(
  page: Page,
  selector: string,
  action: () => Promise<void>,
  { durationMs = 1_000 }: { durationMs?: number } = {},
): Promise<AnimationSample[]> {
  await page.evaluate(startSamplingInPage, { selector, slot: TRACE_SLOT });
  try {
    await action();
  } finally {
    await page.evaluate(stopSamplingInPage, { slot: TRACE_SLOT, afterMs: durationMs });
  }
  return page.evaluate(collectSamplesInPage, TRACE_SLOT);
}

type SamplingInPage = {
  readonly samples: Promise<unknown[]>;
  readonly stopAfter: (afterMs: number) => void;
};

function startSamplingInPage({ selector, slot }: TraceRequest): void {
  const findDeep = (root: Document | ShadowRoot): Element | null => {
    const direct = root.querySelector(selector);
    if (direct) return direct;
    for (const host of root.querySelectorAll("*")) {
      const found = host.shadowRoot ? findDeep(host.shadowRoot) : null;
      if (found) return found;
    }
    return null;
  };
  const animationClock = (): number => Number(document.timeline.currentTime ?? 0);

  const samples: unknown[] = [];
  const startedAt = animationClock();
  let stopAt = Number.POSITIVE_INFINITY;
  const finished = new Promise<unknown[]>((resolve) => {
    const sample = (now: number): void => {
      const element = findDeep(document);
      const elapsedMs = now - startedAt;
      if (element) {
        const style = getComputedStyle(element);
        const matrix = new DOMMatrixReadOnly(
          style.transform === "none" ? undefined : style.transform,
        );
        const rect = element.getBoundingClientRect();
        samples.push({
          elapsedMs,
          isPresent: true,
          opacity: Number(style.opacity),
          transform: style.transform,
          scaleX: Math.hypot(matrix.a, matrix.b),
          scaleY: Math.hypot(matrix.c, matrix.d),
          translateX: matrix.e,
          translateY: matrix.f,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        });
      } else {
        samples.push({
          elapsedMs,
          isPresent: false,
          opacity: 0,
          transform: "none",
          scaleX: 1,
          scaleY: 1,
          translateX: 0,
          translateY: 0,
          rect: { x: 0, y: 0, width: 0, height: 0 },
        });
      }
      if (now < stopAt) requestAnimationFrame(sample);
      else resolve(samples);
    };
    requestAnimationFrame(sample);
  });
  const sampling: SamplingInPage = {
    samples: finished,
    stopAfter: (afterMs) => {
      stopAt = animationClock() + afterMs;
    },
  };
  Reflect.set(window, slot, sampling);
}

function stopSamplingInPage({ slot, afterMs }: { slot: string; afterMs: number }): void {
  (Reflect.get(window, slot) as SamplingInPage).stopAfter(afterMs);
}

function collectSamplesInPage(slot: string): Promise<AnimationSample[]> {
  return (Reflect.get(window, slot) as SamplingInPage).samples as Promise<AnimationSample[]>;
}

/**
 * When something happened, as far as the samples can tell: after `earliestMs` (the last sample
 * before it) and by `latestMs` (the first sample after it). Under load the renderer can skip
 * frames for hundreds of milliseconds, so a bracket can be wide; it is never a guess.
 */
export type MomentBracket = { readonly earliestMs: number; readonly latestMs: number };

export type PropertyTransition = {
  readonly from: number;
  readonly to: number;
  readonly started: MomentBracket;
  readonly settled: MomentBracket;
};

export function measureTransition(
  samples: readonly AnimationSample[],
  property: NumericSampleProperty,
): PropertyTransition {
  const present = samples.filter((sample) => sample.isPresent);
  const first = present[0];
  const last = present.at(-1);
  if (!(first && last)) throw new Error("Traced element never appeared");

  const from = first[property];
  const to = last[property];
  const firstMovingIndex = present.findIndex((sample) => sample[property] !== from);
  if (firstMovingIndex < 0) throw new Error(`${property} never changed from ${from}`);
  const firstSettledIndex = present.findIndex(
    (sample, index) => index >= firstMovingIndex && sample[property] === to,
  );
  const atIndex = (index: number): number => (present[index] ?? last).elapsedMs;
  return {
    from,
    to,
    // A transition starts on the frame its style changes, where it still reports `from`.
    started: { earliestMs: atIndex(firstMovingIndex - 1), latestMs: atIndex(firstMovingIndex) },
    settled: { earliestMs: atIndex(firstSettledIndex - 1), latestMs: atIndex(firstSettledIndex) },
  };
}

/** How far `expectedMs` lies outside every duration the samples allow; 0 when consistent with them. */
export function durationMismatchMs(transition: PropertyTransition, expectedMs: number): number {
  const shortest = transition.settled.earliestMs - transition.started.latestMs;
  const longest = transition.settled.latestMs - transition.started.earliestMs;
  return Math.max(0, shortest - expectedMs, expectedMs - longest);
}

export function isMonotonic(
  samples: readonly AnimationSample[],
  property: NumericSampleProperty,
): boolean {
  const values = samples.filter((sample) => sample.isPresent).map((sample) => sample[property]);
  const isNonDecreasing = values.every(
    (value, index) => index === 0 || value >= (values[index - 1] ?? value),
  );
  const isNonIncreasing = values.every(
    (value, index) => index === 0 || value <= (values[index - 1] ?? value),
  );
  return isNonDecreasing || isNonIncreasing;
}

export type Easing = (progress: number) => number;

export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  const coordinate = (t: number, p1: number, p2: number): number =>
    3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3;
  const solveCurveParameterForX = (x: number): number => {
    let low = 0;
    let high = 1;
    for (let iteration = 0; iteration < 50; iteration++) {
      const middle = (low + high) / 2;
      if (coordinate(middle, x1, x2) < x) low = middle;
      else high = middle;
    }
    return (low + high) / 2;
  };
  return (progress) => coordinate(solveCurveParameterForX(progress), y1, y2);
}

export const linear: Easing = (progress) => progress;

/**
 * Largest gap between the observed normalized progress and `easing`, for the start and end within
 * their brackets that fit the samples best. 0 means a perfect match; frame timing jitter usually
 * keeps real matches below ~0.05.
 */
export function maxDeviationFromEasing(
  samples: readonly AnimationSample[],
  property: NumericSampleProperty,
  easing: Easing,
  transition: PropertyTransition = measureTransition(samples, property),
): number {
  const { from, to, started, settled } = transition;
  if (from === to) throw new Error(`No ${property} transition to compare`);

  const moving = samples.filter(
    (sample) =>
      sample.isPresent &&
      sample.elapsedMs >= started.earliestMs &&
      sample.elapsedMs <= settled.latestMs,
  );
  const deviationFor = (startMs: number, endMs: number): number =>
    Math.max(
      ...moving.map((sample) => {
        const progress = Math.min(1, Math.max(0, (sample.elapsedMs - startMs) / (endMs - startMs)));
        const observed = (sample[property] - from) / (to - from);
        return Math.abs(observed - easing(progress));
      }),
    );
  let best = Number.POSITIVE_INFINITY;
  for (const startMs of momentsWithin(started)) {
    for (const endMs of momentsWithin(settled)) {
      if (endMs > startMs) best = Math.min(best, deviationFor(startMs, endMs));
    }
  }
  return best;
}

function momentsWithin({ earliestMs, latestMs }: MomentBracket): number[] {
  const steps = 64;
  return Array.from(
    { length: steps + 1 },
    (_, step) => earliestMs + ((latestMs - earliestMs) * step) / steps,
  );
}
