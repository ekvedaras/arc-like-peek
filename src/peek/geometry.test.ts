import { describe, expect, test } from "bun:test";
import { peekLayout, peekOriginRect, scaleAboutCentre, transformOnto } from "./geometry.ts";

describe("peek layout", () => {
  test("centres a pane 82 % of the viewport wide, 8 px from top and bottom", () => {
    const { pane } = peekLayout({ width: 1280, height: 800 });

    expect(pane.width).toBeCloseTo(1049.6);
    expect(pane.x).toBeCloseTo((1280 - 1049.6) / 2);
    expect(pane.y).toBe(8);
    expect(pane.height).toBe(784);
  });

  test("caps the pane width on very wide viewports", () => {
    expect(peekLayout({ width: 3000, height: 1200 }).pane.width).toBe(1400);
  });

  test("puts the controls in the right gutter, 14 px from the pane", () => {
    const { pane, controlsRail } = peekLayout({ width: 1280, height: 800 });

    expect(controlsRail).toEqual({
      position: "besidePane",
      x: pane.x + pane.width + 14,
      y: pane.y + 8,
    });
  });

  test("moves the controls inside the pane when the gutter is too narrow for them", () => {
    const { pane, controlsRail } = peekLayout({ width: 300, height: 600 });

    expect(controlsRail.position).toBe("insidePane");
    expect(controlsRail.x + 32).toBeLessThanOrEqual(pane.x + pane.width);
  });
});

describe("transforms", () => {
  test("map a box onto another box with a top-left origin", () => {
    const box = { x: 100, y: 10, width: 1000, height: 800 };
    const target = { x: 40, y: 200, width: 200, height: 20 };

    expect(transformOnto(box, target)).toEqual({
      translateX: -60,
      translateY: 190,
      scaleX: 0.2,
      scaleY: 0.025,
    });
  });

  test("scale a box about its own centre", () => {
    const box = { x: 0, y: 0, width: 1000, height: 800 };

    const scaled = scaleAboutCentre(box, 0.9);

    expect(scaled.translateX).toBeCloseTo(50);
    expect(scaled.translateY).toBeCloseTo(40);
    expect([scaled.scaleX, scaled.scaleY]).toEqual([0.9, 0.9]);
  });
});

describe("where a peek grows from", () => {
  const viewport = { width: 1280, height: 800 };
  const firstLine = { x: 500, y: 100, width: 200, height: 20 };
  const secondLine = { x: 40, y: 120, width: 120, height: 20 };

  test("is the line of a wrapped link that was clicked", () => {
    expect(peekOriginRect([firstLine, secondLine], { x: 60, y: 130 }, viewport)).toEqual(
      secondLine,
    );
  });

  test("is the whole link when the pointer is unknown", () => {
    expect(peekOriginRect([firstLine, secondLine], null, viewport)).toEqual({
      x: 40,
      y: 100,
      width: 660,
      height: 40,
    });
  });

  test("is nothing when the link is hidden or off-screen", () => {
    expect(peekOriginRect([], null, viewport)).toBeNull();
    expect(peekOriginRect([{ x: 0, y: 900, width: 50, height: 20 }], null, viewport)).toBeNull();
    expect(peekOriginRect([{ x: 10, y: 10, width: 0, height: 0 }], null, viewport)).toBeNull();
  });
});
