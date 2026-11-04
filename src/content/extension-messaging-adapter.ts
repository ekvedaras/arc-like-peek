import {
  type PeekedPageNotice,
  type PeekFrameReport,
  type PeekHostNotice,
  type PeekHostRequest,
  type PeekWindowReport,
  parsePeekedPageNotice,
  parsePeekHostNotice,
} from "../messaging/peek-messages.ts";

export async function sendToServiceWorker(
  message: PeekHostRequest | PeekFrameReport | PeekWindowReport,
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

export function onPeekedPageNotice(listener: (notice: PeekedPageNotice) => void): void {
  chrome.runtime.onMessage.addListener((rawMessage) => {
    const notice = parsePeekedPageNotice(rawMessage);
    if (notice) listener(notice);
    return false;
  });
}

export function extensionPageUrl(page: string): string {
  return chrome.runtime.getURL(page);
}
