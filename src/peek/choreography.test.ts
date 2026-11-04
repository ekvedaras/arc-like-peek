import { describe, expect, test } from "bun:test";
import { dismissChoreography, expandChoreography, openChoreography } from "./choreography.ts";
import {
  collapsedLine,
  cssTransform,
  IDENTITY_TRANSFORM,
  pinnedToViewport,
  transformOnto,
} from "./geometry.ts";

const PANE = { x: 115, y: 8, width: 1050, height: 784 };
const LINK = { x: 40, y: 120, width: 180, height: 20 };
const ORIGIN = { link: LINK, rowTop: 110, hasRowSnapshot: true };
const VIEWPORT = { x: 0, y: 0, width: 1280, height: 800 };

const animatedProperties = (steps: ReturnType<typeof openChoreography>) =>
  new Set(
    steps.flatMap((step) =>
      step.keyframes.flatMap((keyframe) => Object.keys(keyframe).filter((key) => key !== "offset")),
    ),
  );

describe("opening", () => {
  test("grows the pane out of the link to its place, height setting off after width", () => {
    const pane = openChoreography(PANE, ORIGIN, "full").find(
      (step) => step.part === "pane" && "transform" in (step.keyframes[0] ?? {}),
    );

    expect(pane?.keyframes[0]?.["transform"]).toBe(cssTransform(transformOnto(PANE, LINK)));
    expect(pane?.keyframes.at(-1)?.["transform"]).toBe("translate(0px, 0px) scale(1, 1)");
    const halfway = pane?.keyframes.find((keyframe) => Number(keyframe["offset"]) >= 0.2);
    const scales = String(halfway?.["transform"]).match(/scale\(([^,]+), ([^)]+)\)/);
    const [, scaleX = 0, scaleY = 0] = scales?.map(Number) ?? [];
    const grown = (scale: number, from: number): number => (scale - from) / (1 - from);
    expect(grown(Number(scaleY), LINK.height / PANE.height)).toBeLessThan(
      grown(Number(scaleX), LINK.width / PANE.width),
    );
  });

  test("fades the row's snapshot out as the pane sets off", () => {
    const steps = openChoreography(PANE, ORIGIN, "full").filter((step) => step.part === "snapshot");

    expect(steps.map((step) => step.keyframes)).toEqual([[{ opacity: 1 }, { opacity: 0 }]]);
    expect(
      openChoreography(PANE, { ...ORIGIN, hasRowSnapshot: false }, "full").some(
        (step) => step.part === "snapshot",
      ),
    ).toBe(false);
  });

  test("only crossfades when the user prefers reduced motion", () => {
    expect(animatedProperties(openChoreography(PANE, ORIGIN, "reduced"))).toEqual(
      new Set(["opacity"]),
    );
  });
});

test("every motion avoids layout, and transforms run apart from anything off the compositor", () => {
  const all = [
    ...openChoreography(PANE, ORIGIN, "full"),
    ...dismissChoreography(PANE, ORIGIN, IDENTITY_TRANSFORM, "full"),
    ...dismissChoreography(PANE, null, IDENTITY_TRANSFORM, "full"),
    ...expandChoreography(PANE, VIEWPORT, IDENTITY_TRANSFORM, "full"),
  ];
  expect(animatedProperties(all)).toEqual(new Set(["transform", "opacity", "borderRadius"]));
  const compositedTogether = all.filter((step) =>
    step.keyframes.some((keyframe) => "transform" in keyframe || "opacity" in keyframe),
  );
  expect(animatedProperties(compositedTogether)).toEqual(new Set(["transform", "opacity"]));
});

test("dismissing collapses the pane into a line without height at the top of the link's row", () => {
  const pane = dismissChoreography(PANE, ORIGIN, IDENTITY_TRANSFORM, "full").find(
    (step) => step.part === "pane" && "transform" in (step.keyframes[0] ?? {}),
  );
  const target = collapsedLine(ORIGIN);

  expect(target).toEqual({ x: LINK.x, y: 110, width: LINK.width, height: 0 });
  expect(pane?.keyframes[0]?.["transform"]).toBe(cssTransform(IDENTITY_TRANSFORM));
  const numbers = (transform: unknown): number[] =>
    String(transform)
      .match(/-?[\d.]+/g)
      ?.map(Number) ?? [];
  const final = numbers(pane?.keyframes.at(-1)?.["transform"]);
  const expected = numbers(cssTransform(transformOnto(PANE, target)));
  expect(final).toHaveLength(4);
  for (const [index, value] of final.entries()) {
    expect(value).toBeCloseTo(expected[index] ?? Number.NaN, 6);
  }
});

test("dismissing fades the row's snapshot in", () => {
  const steps = dismissChoreography(PANE, ORIGIN, IDENTITY_TRANSFORM, "full").filter(
    (step) => step.part === "snapshot",
  );

  expect(steps.map((step) => step.keyframes)).toEqual([[{ opacity: 1 }]]);
});

test("expanding grows the pane to cover the viewport while the page in it holds still", () => {
  const steps = expandChoreography(PANE, VIEWPORT, IDENTITY_TRANSFORM, "full");
  const growth = transformOnto(PANE, VIEWPORT);
  const pane = steps.find(
    (step) => step.part === "pane" && "transform" in (step.keyframes[0] ?? {}),
  );
  const page = steps.find((step) => step.part === "page");

  expect(pane?.keyframes[0]).toEqual({ offset: 0, transform: cssTransform(IDENTITY_TRANSFORM) });
  expect(pane?.keyframes.at(-1)).toEqual({ offset: 1, transform: cssTransform(growth) });
  expect(page?.keyframes.at(-1)).toEqual({
    offset: 1,
    transform: cssTransform(pinnedToViewport(PANE, VIEWPORT, growth)),
  });
  expect(page?.keyframes).toHaveLength(pane?.keyframes.length ?? 0);
});
