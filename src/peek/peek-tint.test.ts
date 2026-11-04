import { describe, expect, test } from "bun:test";
import { peekTint } from "./peek-tint.ts";

const channelsOf = (css: string): number[] => (css.match(/\d+/g) ?? []).map(Number);
const within = (actual: number[], expected: number[], tolerance: number): boolean =>
  actual.length === expected.length &&
  actual.every((value, index) => Math.abs(value - (expected[index] ?? 0)) <= tolerance);

describe("tinting the overlay with the page's colour", () => {
  const green = { red: 20, green: 160, blue: 40 };

  test("reproduces the controls measured in Arc's dark green Space", () => {
    const tint = peekTint(green, "dark");

    expect(within(channelsOf(tint?.controlBackground ?? ""), [1, 14, 1], 3)).toBe(true);
    expect(within(channelsOf(tint?.controlGlyph ?? ""), [198, 249, 205], 8)).toBe(true);
  });

  test("tints the scrim with the page's hue", () => {
    const [red = 0, greenChannel = 0, blue = 0] = channelsOf(peekTint(green, "dark")?.scrim ?? "");

    expect(greenChannel).toBeGreaterThan(red);
    expect(greenChannel).toBeGreaterThan(blue);
  });

  test("leaves neutral pages and pages without a colour to the neutral look", () => {
    expect(peekTint({ red: 255, green: 255, blue: 255 }, "light")).toBeNull();
    expect(peekTint({ red: 13, green: 13, blue: 13 }, "dark")).toBeNull();
    expect(peekTint(null, "dark")).toBeNull();
  });

  test("keeps the light scheme light", () => {
    const tint = peekTint(green, "light");

    expect(Math.min(...channelsOf(tint?.controlBackground ?? ""))).toBeGreaterThan(240);
  });
});
