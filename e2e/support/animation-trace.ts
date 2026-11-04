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

type TraceRequest = { readonly selector: string; readonly durationMs: number };

const TRACE_SLOT = "__arcLikePeekAnimationTrace";

/**
 * Samples the element every animation frame while `action` runs, so curves can be asserted numerically.
 * The selector pierces open shadow roots; the element may appear only after `action` starts.
 */
export async function traceAnimation(
  page: Page,
  selector: string,
  action: () => Promise<void>,
  { durationMs = 1_000 }: { durationMs?: number } = {},
): Promise<AnimationSample[]> {
  await page.evaluate(startSamplingInPage, { selector, durationMs, slot: TRACE_SLOT });
  await action();
  return page.evaluate(collectSamplesInPage, TRACE_SLOT);
}

function startSamplingInPage({
  selector,
  durationMs,
  slot,
}: TraceRequest & { slot: string }): void {
  const findDeep = (root: Document | ShadowRoot): Element | null => {
    const direct = root.querySelector(selector);
    if (direct) return direct;
    for (const host of root.querySelectorAll("*")) {
      const found = host.shadowRoot ? findDeep(host.shadowRoot) : null;
      if (found) return found;
    }
    return null;
  };

  const samples: unknown[] = [];
  const startedAt = performance.now();
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
      if (elapsedMs < durationMs) requestAnimationFrame(sample);
      else resolve(samples);
    };
    requestAnimationFrame(sample);
  });
  Reflect.set(window, slot, finished);
}

function collectSamplesInPage(slot: string): Promise<AnimationSample[]> {
  return Reflect.get(window, slot) as Promise<AnimationSample[]>;
}

export type PropertyTransition = {
  readonly from: number;
  readonly to: number;
  readonly startedAtMs: number;
  readonly settledAtMs: number;
  readonly durationMs: number;
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
  // A transition starts on the frame its style changes, where it still reports `from`: the last frame at rest.
  const startedAtMs = (present[firstMovingIndex - 1] ?? first).elapsedMs;
  const firstSettled = present.find(
    (sample, index) => index >= firstMovingIndex && sample[property] === to,
  );
  const settledAtMs = (firstSettled ?? last).elapsedMs;
  return { from, to, startedAtMs, settledAtMs, durationMs: settledAtMs - startedAtMs };
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
 * Largest gap between the observed normalized progress and `easing`, over the measured transition window.
 * 0 means a perfect match; frame timing jitter usually keeps real matches below ~0.05.
 */
export function maxDeviationFromEasing(
  samples: readonly AnimationSample[],
  property: NumericSampleProperty,
  easing: Easing,
  transition: PropertyTransition = measureTransition(samples, property),
): number {
  const { from, to, startedAtMs, durationMs } = transition;
  if (durationMs <= 0 || from === to) throw new Error(`No ${property} transition to compare`);

  const window = samples.filter(
    (sample) =>
      sample.isPresent &&
      sample.elapsedMs >= startedAtMs &&
      sample.elapsedMs <= startedAtMs + durationMs,
  );
  return Math.max(
    ...window.map((sample) => {
      const expected = easing((sample.elapsedMs - startedAtMs) / durationMs);
      const observed = (sample[property] - from) / (to - from);
      return Math.abs(observed - expected);
    }),
  );
}
