import {
  type PeekFrameReport,
  type PeekHostNotice,
  type PeekHostRequest,
  parsePeekHostNotice,
} from "../messaging/peek-messages.ts";

export async function sendToServiceWorker(
  message: PeekHostRequest | PeekFrameReport,
): Promise<void> {
  await chrome.runtime.sendMessage(message);
}

export function onPeekHostNotice(listener: (notice: PeekHostNotice) => void): void {
  chrome.runtime.onMessage.addListener((rawMessage) => {
    const notice = parsePeekHostNotice(rawMessage);
    if (notice) listener(notice);
    return false;
  });
}

export function extensionPageUrl(page: string): string {
  return chrome.runtime.getURL(page);
}
