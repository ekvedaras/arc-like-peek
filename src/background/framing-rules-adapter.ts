import type { FramingAllowance } from "./peek-framing-policy.ts";

const { HeaderOperation, ResourceType, RuleActionType } = chrome.declarativeNetRequest;

export async function grantFramingAllowance(allowance: FramingAllowance): Promise<void> {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [allowance.ruleId],
    addRules: [
      {
        id: allowance.ruleId,
        priority: 1,
        condition: { tabIds: [allowance.tabId], resourceTypes: [ResourceType.SUB_FRAME] },
        action: {
          type: RuleActionType.MODIFY_HEADERS,
          responseHeaders: allowance.strippedResponseHeaders.map((header) => ({
            header,
            operation: HeaderOperation.REMOVE,
          })),
        },
      },
    ],
  });
}

export async function withdrawFramingAllowance(allowance: FramingAllowance): Promise<void> {
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [allowance.ruleId] });
}

export async function withdrawAllFramingAllowances(): Promise<void> {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: rules.map((rule) => rule.id),
  });
}
