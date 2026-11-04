import type { FramingAllowance, FramingRule } from "./peek-framing-policy.ts";

const { HeaderOperation, ResourceType, RuleActionType } = chrome.declarativeNetRequest;

type SessionRule = chrome.declarativeNetRequest.Rule;

/**
 * Tab ids are too large to derive rule ids from, so rules get free ids and are found again by the
 * tab they are scoped to. Changes run one at a time, so two tabs never claim the same id.
 */
let pendingChange: Promise<void> = Promise.resolve();

function changeSessionRules(
  change: (rules: readonly SessionRule[]) => chrome.declarativeNetRequest.UpdateRuleOptions,
): Promise<void> {
  const run = async (): Promise<void> => {
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    await chrome.declarativeNetRequest.updateSessionRules(change(rules));
  };
  const done = pendingChange.then(run);
  pendingChange = done.catch(() => {});
  return done;
}

export function grantFramingAllowance(allowance: FramingAllowance): Promise<void> {
  return changeSessionRules((rules) => {
    const replaced = idsOfRulesInTab(rules, allowance.tabId);
    const freeIds = freeRuleIds(rules, replaced);
    return {
      removeRuleIds: replaced,
      addRules: allowance.rules.map((rule) =>
        sessionRuleFor(freeIds.next().value, allowance.tabId, rule),
      ),
    };
  });
}

export function withdrawFramingAllowance(allowance: FramingAllowance): Promise<void> {
  return changeSessionRules((rules) => ({
    removeRuleIds: idsOfRulesInTab(rules, allowance.tabId),
  }));
}

export function withdrawAllFramingAllowances(): Promise<void> {
  return changeSessionRules((rules) => ({ removeRuleIds: rules.map((rule) => rule.id) }));
}

function idsOfRulesInTab(rules: readonly SessionRule[], tabId: number): number[] {
  return rules.filter((rule) => rule.condition.tabIds?.includes(tabId)).map((rule) => rule.id);
}

function* freeRuleIds(
  rules: readonly SessionRule[],
  beingRemoved: readonly number[],
): Generator<number, never> {
  const taken = new Set(rules.map((rule) => rule.id).filter((id) => !beingRemoved.includes(id)));
  for (let id = 1; ; id++) if (!taken.has(id)) yield id;
}

function sessionRuleFor(id: number, tabId: number, rule: FramingRule): SessionRule {
  const { onlyWhenValueMatches } = rule;
  return {
    id,
    priority: 1,
    condition: {
      tabIds: [tabId],
      resourceTypes: [ResourceType.SUB_FRAME],
      ...(onlyWhenValueMatches && {
        responseHeaders: [{ header: rule.strippedHeader, values: [...onlyWhenValueMatches] }],
      }),
    },
    action: {
      type: RuleActionType.MODIFY_HEADERS,
      responseHeaders: [{ header: rule.strippedHeader, operation: HeaderOperation.REMOVE }],
    },
  };
}
