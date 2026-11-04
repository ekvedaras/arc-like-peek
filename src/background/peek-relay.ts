import type { PeekHostNotice, PeekMessage } from "../messaging/peek-messages.ts";
import { type FramingAllowance, framingAllowanceFor } from "./peek-framing-policy.ts";

export type PeekRelayPorts = {
  readonly grantFraming: (allowance: FramingAllowance) => Promise<void>;
  readonly withdrawFraming: (allowance: FramingAllowance) => Promise<void>;
  readonly openTabNextTo: (tabId: number, url: string) => Promise<void>;
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
      if (fromTopFrame) await ports.openTabNextTo(sender.tabId, message.url);
      return;
    case "peekFrame/navigated":
      if (!fromTopFrame) {
        await ports.notifyTopFrame(sender.tabId, {
          type: "peekHostNotice/frameNavigated",
          url: message.url,
        });
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
