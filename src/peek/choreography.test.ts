import { describe, expect, test } from "bun:test";
import { dismissChoreography, expandChoreography, openChoreography } from "./choreography.ts";
import { cssTransform, transformOnto } from "./geometry.ts";

const PANE = { x: 115, y: 8, width: 1050, height: 784 };
const LINK = { x: 40, y: 120, width: 180, height: 20 };
const VIEWPORT = { x: 0, y: 0, width: 1280, height: 800 };

const animatedProperties = (steps: ReturnType<typeof openChoreography>) =>
  new Set(steps.flatMap((step) => step.keyframes.flatMap((keyframe) => Object.keys(keyframe))));

describe("opening", () => {
  test("grows the pane out of the link to its place", () => {
    const pane = openChoreography(PANE, LINK, "full").find(
      (step) => step.part === "pane" && "transform" in (step.keyframes[0] ?? {}),
    );

    expect(pane?.keyframes).toEqual([
      { transform: cssTransform(transformOnto(PANE, LINK)) },
      { transform: "translate(0px, 0px) scale(1, 1)" },
    ]);
    expect(pane?.timing.easing).toStartWith("linear(");
  });

  test("only crossfades when the user prefers reduced motion", () => {
    expect(animatedProperties(openChoreography(PANE, LINK, "reduced"))).toEqual(
      new Set(["opacity"]),
    );
  });
});

test("every motion animates only transform and opacity, so it stays on the compositor", () => {
  const all = [
    ...openChoreography(PANE, LINK, "full"),
    ...dismissChoreography(PANE, LINK, "full"),
    ...dismissChoreography(PANE, null, "full"),
    ...expandChoreography(PANE, VIEWPORT, "full"),
  ];
  expect(animatedProperties(all)).toEqual(new Set(["transform", "opacity"]));
});

test("dismissing shrinks back into the link, from wherever the pane is now", () => {
  const pane = dismissChoreography(PANE, LINK, "full").find(
    (step) => step.part === "pane" && "transform" in (step.keyframes[0] ?? {}),
  );

  expect(pane?.keyframes).toEqual([{ transform: cssTransform(transformOnto(PANE, LINK)) }]);
});

test("expanding grows the pane to cover the viewport without stretching the page in it", () => {
  const steps = expandChoreography(PANE, VIEWPORT, "full");
  const growth = transformOnto(PANE, VIEWPORT);

  expect(steps.find((step) => step.part === "pane")?.keyframes).toEqual([
    { transform: cssTransform(growth) },
  ]);
  expect(steps.find((step) => step.part === "page")?.keyframes).toEqual([
    {
      transform: cssTransform({
        translateX: 0,
        translateY: 0,
        scaleX: 1 / growth.scaleX,
        scaleY: 1 / growth.scaleY,
      }),
    },
  ]);
});
