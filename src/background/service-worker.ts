import {
  grantFramingAllowance,
  withdrawAllFramingAllowances,
  withdrawFramingAllowance,
} from "./framing-rules-adapter.ts";
import { framingAllowanceFor } from "./peek-framing-policy.ts";
import { type PeekRelayPorts, relayPeekMessage } from "./peek-relay.ts";
import { onExtensionStarted, onPeekMessage } from "./runtime-adapter.ts";
import {
  notifyTopFrame,
  onTabClosed,
  onTopFrameNavigated,
  openBackgroundTabNextTo,
  switchToTab,
  tabFinishedLoading,
} from "./tabs-adapter.ts";

const ports: PeekRelayPorts = {
  grantFraming: grantFramingAllowance,
  withdrawFraming: withdrawFramingAllowance,
  openBackgroundTabNextTo,
  tabFinishedLoading,
  switchToTab,
  elapse: (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
  notifyTopFrame,
};

onPeekMessage((message, sender) => relayPeekMessage(ports, message, sender));

const withdrawFramingInTab = (tabId: number): void => {
  withdrawFramingAllowance(framingAllowanceFor(tabId)).catch((error: unknown) =>
    console.error("Could not withdraw framing allowance", tabId, error),
  );
};

// A Peek normally revokes its own allowance on close; these cover pages that go away while peeking.
onTabClosed(withdrawFramingInTab);
onTopFrameNavigated(withdrawFramingInTab);
onExtensionStarted(() => {
  withdrawAllFramingAllowances().catch((error: unknown) =>
    console.error("Could not clear framing allowances", error),
  );
});
