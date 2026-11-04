import type { PeekKeyCommand } from "../peek/peek-keyboard.ts";
import type { PeekHistoryChange } from "../peek/peek-session.ts";

/** Sent by the page that shows a Peek (the tab's top frame) to the service worker. */
export type PeekHostRequest =
  | { readonly type: "peekHost/grantAccess" }
  | { readonly type: "peekHost/revokeAccess" }
  | { readonly type: "peekHost/openInTab"; readonly url: string };

/** Sent by the peeked page (inside the Peek's frame) to the service worker. */
export type PeekFrameReport =
  | {
      readonly type: "peekFrame/navigated";
      readonly url: string;
      readonly historyChange: PeekHistoryChange;
    }
  | { readonly type: "peekFrame/keyCommand"; readonly command: PeekKeyCommand };

/**
 * Sent by the Peek window (the extension page that frames the peeked page) before it loads `url`,
 * so the service worker knows which frames belong to the Peek and can share the user's sign-in.
 */
export type PeekWindowReport = { readonly type: "peekWindow/opened"; readonly url: string };

/** Relayed by the service worker from the peeked page to the page that shows the Peek. */
export type PeekHostNotice =
  | {
      readonly type: "peekHostNotice/frameNavigated";
      readonly url: string;
      readonly historyChange: PeekHistoryChange;
    }
  | { readonly type: "peekHostNotice/keyCommand"; readonly command: PeekKeyCommand };

/** Sent by the service worker to the peeked page. */
export type PeekedPageNotice = {
  /** The page was requested before the sign-in that led to it was in place; load it again. */
  readonly type: "peekedPageNotice/reload";
};

export type PeekMessage = PeekHostRequest | PeekFrameReport | PeekWindowReport;

/**
 * The name of the Peek's frame. A browsing context keeps its name across navigations, so the
 * content script inside the frame can tell it is being peeked on every page the user visits there.
 */
export const PEEK_FRAME_NAME = "arc-like-peek-frame";

export function parsePeekMessage(message: unknown): PeekMessage | null {
  if (!isRecord(message)) return null;
  switch (message["type"]) {
    case "peekHost/grantAccess":
    case "peekHost/revokeAccess":
      return { type: message["type"] };
    case "peekHost/openInTab":
    case "peekWindow/opened": {
      const url = message["url"];
      return typeof url === "string" ? { type: message["type"], url } : null;
    }
    case "peekFrame/navigated": {
      const url = message["url"];
      const historyChange = parseHistoryChange(message["historyChange"]);
      return typeof url === "string" && historyChange
        ? { type: message["type"], url, historyChange }
        : null;
    }
    case "peekFrame/keyCommand": {
      const command = parseKeyCommand(message["command"]);
      return command ? { type: message["type"], command } : null;
    }
    default:
      return null;
  }
}

export function parsePeekHostNotice(message: unknown): PeekHostNotice | null {
  if (!isRecord(message)) return null;
  switch (message["type"]) {
    case "peekHostNotice/frameNavigated": {
      const url = message["url"];
      const historyChange = parseHistoryChange(message["historyChange"]);
      return typeof url === "string" && historyChange
        ? { type: message["type"], url, historyChange }
        : null;
    }
    case "peekHostNotice/keyCommand": {
      const command = parseKeyCommand(message["command"]);
      return command ? { type: message["type"], command } : null;
    }
    default:
      return null;
  }
}

export function parsePeekedPageNotice(message: unknown): PeekedPageNotice | null {
  return isRecord(message) && message["type"] === "peekedPageNotice/reload"
    ? { type: message["type"] }
    : null;
}

function parseKeyCommand(command: unknown): PeekKeyCommand | null {
  return command === "dismiss" || command === "expand" ? command : null;
}

function parseHistoryChange(change: unknown): PeekHistoryChange | null {
  return change === "entryAdded" || change === "entryReplaced" || change === "untracked"
    ? change
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
