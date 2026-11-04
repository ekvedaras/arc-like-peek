import type { PeekFrameReport, PeekHostNotice, PeekMessage } from "../messaging/peek-messages.ts";
import { PEEK_MOTION } from "../peek/motion-tokens.ts";
import { asPeekableUrl } from "../peek/peek-trigger.ts";
import type { DurationMs } from "../peek/units.ts";
import { type FramingAllowance, framingAllowanceFor } from "./peek-framing-policy.ts";

export type PeekRelayPorts = {
  readonly grantFraming: (allowance: FramingAllowance) => Promise<void>;
  readonly withdrawFraming: (allowance: FramingAllowance) => Promise<void>;
  readonly peekOpening: (tabId: number) => Promise<void>;
  readonly peekWindowOpened: (tabId: number, frameId: number, url: URL) => Promise<void>;
  readonly peekClosed: (tabId: number) => Promise<void>;
  /** True when the page just loaded was requested before the sign-in leading to it was in place. */
  readonly peekedPageLoaded: (tabId: number, frameId: number) => Promise<boolean>;
  readonly reloadPeekedPage: (tabId: number, frameId: number) => Promise<void>;
  readonly openBackgroundTabNextTo: (tabId: number, url: string) => Promise<number>;
  readonly tabFinishedLoading: (tabId: number) => Promise<void>;
  readonly switchToTab: (tabId: number) => Promise<void>;
  readonly elapse: (duration: DurationMs) => Promise<void>;
  readonly notifyTopFrame: (tabId: number, notice: PeekHostNotice) => Promise<void>;
};

export type PeekMessageSender = {
  readonly tabId: number;
  readonly frameId: number;
  /** Sent from one of this extension's own pages, not from a content script in a web page. */
  readonly isExtensionPage: boolean;
};

const TOP_FRAME_ID = 0;

/**
 * Routes Peek messages: the page showing a Peek (top frame) manages the Peek's access and tabs, the
 * Peek window introduces the Peek's frames, and the peeked page can only report to the page showing it.
 */
export async function relayPeekMessage(
  ports: PeekRelayPorts,
  message: PeekMessage,
  sender: PeekMessageSender,
): Promise<void> {
  const fromHost = sender.frameId === TOP_FRAME_ID && !sender.isExtensionPage;
  switch (message.type) {
    case "peekHost/grantAccess":
      if (fromHost) {
        await ports.grantFraming(framingAllowanceFor(sender.tabId));
        await ports.peekOpening(sender.tabId);
      }
      return;
    case "peekHost/revokeAccess":
      if (fromHost) {
        await ports.withdrawFraming(framingAllowanceFor(sender.tabId));
        await ports.peekClosed(sender.tabId);
      }
      return;
    case "peekHost/openInTab":
      if (fromHost) await handOverToTab(ports, sender.tabId, message.url);
      return;
    case "peekWindow/opened": {
      const url = asPeekableUrl(message.url);
      if (sender.isExtensionPage && url) {
        await ports.peekWindowOpened(sender.tabId, sender.frameId, new URL(url));
      }
      return;
    }
    case "peekFrame/navigated":
    case "peekFrame/keyCommand":
      if (!fromHost) await relayToHost(ports, message, sender);
      return;
  }
}

async function relayToHost(
  ports: PeekRelayPorts,
  report: PeekFrameReport,
  sender: PeekMessageSender,
): Promise<void> {
  switch (report.type) {
    case "peekFrame/navigated":
      // Only the peeked page navigates; the Peek window never does.
      if (!sender.isExtensionPage) {
        if (await ports.peekedPageLoaded(sender.tabId, sender.frameId)) {
          await ports.reloadPeekedPage(sender.tabId, sender.frameId);
        }
        await ports.notifyTopFrame(sender.tabId, {
          type: "peekHostNotice/frameNavigated",
          url: report.url,
          historyChange: report.historyChange,
        });
      }
      return;
    case "peekFrame/keyCommand":
      await ports.notifyTopFrame(sender.tabId, {
        type: "peekHostNotice/keyCommand",
        command: report.command,
      });
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
