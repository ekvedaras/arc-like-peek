import {
  cubicBezier,
  isMonotonic,
  linear,
  maxDeviationFromEasing,
  measureTransition,
  traceAnimation,
} from "./support/animation-trace.ts";
import { captureScreenshot } from "./support/artifacts.ts";
import { expect, test } from "./support/extension-test.ts";
import { shiftClick } from "./support/interactions.ts";

test.describe("e2e harness self-checks", () => {
  test("animation trace measures a known CSS transition", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url("/animation.html"));

    const samples = await traceAnimation(page, "#box", () => page.locator("#show").click(), {
      durationMs: 700,
    });

    const opacity = measureTransition(samples, "opacity");
    expect(opacity.from).toBe(0);
    expect(opacity.to).toBe(1);
    expect(opacity.durationMs).toBeGreaterThan(330);
    expect(opacity.durationMs).toBeLessThan(470);
    expect(isMonotonic(samples, "opacity")).toBe(true);
    expect(maxDeviationFromEasing(samples, "opacity", linear)).toBeLessThan(0.1);
    expect(maxDeviationFromEasing(samples, "scaleX", cubicBezier(0.2, 0.8, 0.2, 1))).toBeLessThan(
      0.1,
    );
  });

  test("framing-denied fixture sends anti-framing headers", async ({ page, fixtureServer }) => {
    const response = await page.goto(fixtureServer.url("/framing-denied.html"));

    expect(response?.headers()["x-frame-options"]).toBe("DENY");
    expect(response?.headers()["content-security-policy"]).toBe("frame-ancestors 'none'");
  });

  test("shift+click dispatches a shift-modified click on the link", async ({
    page,
    fixtureServer,
  }, testInfo) => {
    await page.goto(fixtureServer.url("/links.html"));
    const observedClick = page.evaluate(
      () =>
        new Promise<{ shiftKey: boolean; targetId: string | undefined }>((resolve) => {
          document.addEventListener(
            "click",
            (event) => {
              event.preventDefault();
              const link = event.target instanceof Element ? event.target.closest("a") : null;
              resolve({ shiftKey: event.shiftKey, targetId: link?.id });
            },
            { once: true },
          );
        }),
    );

    await shiftClick(page.locator("#nested-element-link"));

    expect(await observedClick).toEqual({ shiftKey: true, targetId: "nested-element-link" });
    await captureScreenshot(page, testInfo, "links-after-shift-click");
  });
});
