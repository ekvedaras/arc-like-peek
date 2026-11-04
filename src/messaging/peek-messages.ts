import type { PeekKeyCommand } from "../peek/peek-keyboard.ts";

/** Sent by the page that shows a Peek (the tab's top frame) to the service worker. */
export type PeekHostRequest =
  | { readonly type: "peekHost/allowFraming" }
  | { readonly type: "peekHost/revokeFraming" }
  | { readonly type: "peekHost/openInTab"; readonly url: string };

/** Sent by the peeked page (inside the Peek's frame) to the service worker. */
export type PeekFrameReport =
  | { readonly type: "peekFrame/navigated"; readonly url: string }
  | { readonly type: "peekFrame/keyCommand"; readonly command: PeekKeyCommand };

/** Relayed by the service worker from the peeked page to the page that shows the Peek. */
export type PeekHostNotice =
  | { readonly type: "peekHostNotice/frameNavigated"; readonly url: string }
  | { readonly type: "peekHostNotice/keyCommand"; readonly command: PeekKeyCommand };

export type PeekMessage = PeekHostRequest | PeekFrameReport;

/**
 * The name of the Peek's frame. A browsing context keeps its name across navigations, so the
 * content script inside the frame can tell it is being peeked on every page the user visits there.
 */
export const PEEK_FRAME_NAME = "arc-like-peek-frame";

export function parsePeekMessage(message: unknown): PeekMessage | null {
  if (!isRecord(message)) return null;
  switch (message["type"]) {
    case "peekHost/allowFraming":
    case "peekHost/revokeFraming":
      return { type: message["type"] };
    case "peekHost/openInTab":
    case "peekFrame/navigated": {
      const url = message["url"];
      return typeof url === "string" ? { type: message["type"], url } : null;
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
      return typeof url === "string" ? { type: message["type"], url } : null;
    }
    case "peekHostNotice/keyCommand": {
      const command = parseKeyCommand(message["command"]);
      return command ? { type: message["type"], command } : null;
    }
    default:
      return null;
  }
}

function parseKeyCommand(command: unknown): PeekKeyCommand | null {
  return command === "dismiss" || command === "expand" ? command : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
