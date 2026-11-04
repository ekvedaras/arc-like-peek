import { expect, test } from "bun:test";
import { framingAllowanceFor } from "./peek-framing-policy.ts";

test("a page's CSP is only stripped when it restricts framing, X-Frame-Options always", () => {
  expect(framingAllowanceFor(1087896609)).toEqual({
    tabId: 1087896609,
    rules: [
      { strippedHeader: "x-frame-options" },
      { strippedHeader: "content-security-policy", onlyWhenValueMatches: ["*frame-ancestors*"] },
    ],
  });
});

test("ids that are not tab ids are rejected", () => {
  expect(() => framingAllowanceFor(0)).toThrow(RangeError);
  expect(() => framingAllowanceFor(-1)).toThrow(RangeError);
});
