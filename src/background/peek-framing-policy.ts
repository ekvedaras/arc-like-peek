/**
 * Which responses lose their anti-framing headers while a Peek is shown. See
 * wiki/decisions/2026-11-04-peek-framing.md for why this is the narrowest scope available.
 */
export type FramingAllowance = {
  /** One allowance per tab, so re-arming replaces and revoking removes exactly this one. */
  readonly ruleId: number;
  /** Only sub-frame documents in the tab that shows the Peek. */
  readonly tabId: number;
  readonly strippedResponseHeaders: readonly string[];
};

const ANTI_FRAMING_HEADERS = ["x-frame-options", "content-security-policy"] as const;

export function framingAllowanceFor(tabId: number): FramingAllowance {
  if (!(Number.isInteger(tabId) && tabId > 0)) throw new RangeError(`Not a tab id: ${tabId}`);
  return { ruleId: tabId, tabId, strippedResponseHeaders: ANTI_FRAMING_HEADERS };
}
