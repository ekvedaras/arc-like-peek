import { type PeekMessage, parsePeekMessage } from "../messaging/peek-messages.ts";
import type { PeekMessageSender } from "./peek-relay.ts";

/** Delivers well-formed Peek messages from content scripts; replies once `handle` has finished. */
export function onPeekMessage(
  handle: (message: PeekMessage, sender: PeekMessageSender) => Promise<void>,
): void {
  chrome.runtime.onMessage.addListener((rawMessage, sender, reply) => {
    const message = parsePeekMessage(rawMessage);
    const tabId = sender.tab?.id;
    if (!message || tabId === undefined || sender.frameId === undefined) return false;

    handle(message, { tabId, frameId: sender.frameId }).then(
      () => reply({ ok: true }),
      (error: unknown) => {
        console.error("Peek message failed", message, error);
        reply({ ok: false });
      },
    );
    return true;
  });
}

export function onExtensionStarted(listener: () => void): void {
  chrome.runtime.onStartup.addListener(listener);
  chrome.runtime.onInstalled.addListener(listener);
}
