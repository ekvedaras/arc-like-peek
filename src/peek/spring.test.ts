import { describe, expect, test } from "bun:test";
import { springCurve } from "./spring.ts";
import { ms } from "./units.ts";

const TOLERANCE = 0.001;

describe("spring curves", () => {
  test("start at rest and end exactly on target", () => {
    const curve = springCurve({ response: ms(380), dampingRatio: 0.85 }, TOLERANCE);

    expect(curve.progressAt(0)).toBe(0);
    expect(curve.progressAt(1)).toBe(1);
  });

  test("an underdamped spring overshoots slightly, a critically damped one never does", () => {
    const sampleMax = (dampingRatio: number): number => {
      const curve = springCurve({ response: ms(380), dampingRatio }, TOLERANCE);
      return Math.max(...Array.from({ length: 501 }, (_, index) => curve.progressAt(index / 500)));
    };

    const overshoot = sampleMax(0.85) - 1;
    expect(overshoot).toBeGreaterThan(0.002);
    expect(overshoot).toBeLessThan(0.02);
    expect(sampleMax(1)).toBeLessThanOrEqual(1);
    expect(sampleMax(1.4)).toBeLessThanOrEqual(1);
  });

  test("lasts until it stays within tolerance of the target", () => {
    const curve = springCurve({ response: ms(220), dampingRatio: 1 }, TOLERANCE);
    const justBeforeEnd = curve.progressAt(1 - 2 / curve.duration);

    // Critically damped: 1 - e^(-ωt)(1 + ωt) reaches 0.999 at ωt ≈ 9.23, with ω = 2π / 0.22 s.
    expect(curve.duration).toBeCloseTo(323, -1);
    expect(1 - justBeforeEnd).toBeLessThanOrEqual(TOLERANCE * 1.1);
  });

  test("a stiffer spring (shorter response) settles sooner", () => {
    const quick = springCurve({ response: ms(200), dampingRatio: 0.9 }, TOLERANCE);
    const slow = springCurve({ response: ms(500), dampingRatio: 0.9 }, TOLERANCE);

    expect(quick.duration).toBeLessThan(slow.duration);
  });

  test("is expressed as a CSS linear() easing that ends on 1", () => {
    const { cssEasing } = springCurve({ response: ms(380), dampingRatio: 0.85 }, TOLERANCE);

    expect(cssEasing).toStartWith("linear(0, ");
    expect(cssEasing).toEndWith(", 1)");
    expect(cssEasing.split(",").length).toBe(65);
  });

  test("rejects springs that cannot move", () => {
    expect(() => springCurve({ response: ms(380), dampingRatio: 0 }, TOLERANCE)).toThrow();
    expect(() => springCurve({ response: ms(0), dampingRatio: 1 }, TOLERANCE)).toThrow();
  });
});
