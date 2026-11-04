/**
 * Which responses lose which anti-framing headers while a Peek is shown. See
 * wiki/decisions/2026-11-04-peek-framing.md for why a tab is the narrowest scope available.
 */
export type FramingAllowance = {
  /** Only sub-frame documents in the tab that shows the Peek. */
  readonly tabId: number;
  readonly rules: readonly FramingRule[];
};

export type FramingRule = {
  readonly strippedHeader: string;
  /** Strip the header only when its value matches one of these patterns (`*` is a wildcard). */
  readonly onlyWhenValueMatches?: readonly string[];
};

/**
 * Chrome can only drop a whole header, not one directive of it. A page's CSP is therefore kept
 * unless it restricts framing; when it does, the page loses all of it inside the Peek.
 */
const FRAMING_RULES: readonly FramingRule[] = [
  { strippedHeader: "x-frame-options" },
  { strippedHeader: "content-security-policy", onlyWhenValueMatches: ["*frame-ancestors*"] },
];

export function framingAllowanceFor(tabId: number): FramingAllowance {
  if (!(Number.isInteger(tabId) && tabId > 0)) throw new RangeError(`Not a tab id: ${tabId}`);
  return { tabId, rules: FRAMING_RULES };
}
