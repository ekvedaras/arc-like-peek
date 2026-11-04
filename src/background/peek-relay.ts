import type { PeekHostNotice, PeekMessage } from "../messaging/peek-messages.ts";
import { PEEK_MOTION } from "../peek/motion-tokens.ts";
import type { DurationMs } from "../peek/units.ts";
import { type FramingAllowance, framingAllowanceFor } from "./peek-framing-policy.ts";

export type PeekRelayPorts = {
  readonly grantFraming: (allowance: FramingAllowance) => Promise<void>;
  readonly withdrawFraming: (allowance: FramingAllowance) => Promise<void>;
  readonly openBackgroundTabNextTo: (tabId: number, url: string) => Promise<number>;
  readonly tabFinishedLoading: (tabId: number) => Promise<void>;
  readonly switchToTab: (tabId: number) => Promise<void>;
  readonly elapse: (duration: DurationMs) => Promise<void>;
  readonly notifyTopFrame: (tabId: number, notice: PeekHostNotice) => Promise<void>;
};

export type PeekMessageSender = { readonly tabId: number; readonly frameId: number };

const TOP_FRAME_ID = 0;

/**
 * Routes Peek messages: the page showing a Peek (top frame) manages framing and tabs, the peeked
 * page (a sub-frame) can only report to the page showing it.
 */
export async function relayPeekMessage(
  ports: PeekRelayPorts,
  message: PeekMessage,
  sender: PeekMessageSender,
): Promise<void> {
  const fromTopFrame = sender.frameId === TOP_FRAME_ID;
  switch (message.type) {
    case "peekHost/allowFraming":
      if (fromTopFrame) await ports.grantFraming(framingAllowanceFor(sender.tabId));
      return;
    case "peekHost/revokeFraming":
      if (fromTopFrame) await ports.withdrawFraming(framingAllowanceFor(sender.tabId));
      return;
    case "peekHost/openInTab":
      if (fromTopFrame) await handOverToTab(ports, sender.tabId, message.url);
      return;
    case "peekFrame/navigated":
      if (!fromTopFrame) {
        await ports.notifyTopFrame(sender.tabId, {
          type: "peekHostNotice/frameNavigated",
          url: message.url,
          historyChange: message.historyChange,
        });
      }
      return;
    case "peekFrame/painted":
      if (!fromTopFrame) {
        await ports.notifyTopFrame(sender.tabId, { type: "peekHostNotice/framePainted" });
      }
      return;
    case "peekFrame/keyCommand":
      if (!fromTopFrame) {
        await ports.notifyTopFrame(sender.tabId, {
          type: "peekHostNotice/keyCommand",
          command: message.command,
        });
      }
      return;
  }
}

/**
 * A Peek cannot carry its page into a tab, so the tab loads it afresh. It loads out of sight while
 * the expanded Peek, already laid out like the tab, stays on screen; the switch happens once the tab
 * has its page, or after a short wait at most, so a slow page never holds the user back for long.
 */
async function handOverToTab(ports: PeekRelayPorts, tabId: number, url: string): Promise<void> {
  const tab = await ports.openBackgroundTabNextTo(tabId, url);
  await Promise.race([ports.tabFinishedLoading(tab), ports.elapse(PEEK_MOTION.tabHandoverMaxWait)]);
  await ports.switchToTab(tab);
}
