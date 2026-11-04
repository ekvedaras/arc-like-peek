import type { PeekHostNotice } from "../messaging/peek-messages.ts";

const TOP_FRAME_ID = 0;

export async function openTabNextTo(tabId: number, url: string): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  await chrome.tabs.create({
    url,
    index: tab.index + 1,
    openerTabId: tabId,
    windowId: tab.windowId,
    active: true,
  });
}

export async function notifyTopFrame(tabId: number, notice: PeekHostNotice): Promise<void> {
  await chrome.tabs.sendMessage(tabId, notice, { frameId: TOP_FRAME_ID });
}

export function onTabClosed(listener: (tabId: number) => void): void {
  chrome.tabs.onRemoved.addListener((tabId) => listener(tabId));
}

/** Fires when the tab's top-level page starts loading another document. */
export function onTopFrameNavigated(listener: (tabId: number) => void): void {
  chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === "loading" && change.url !== undefined) listener(tabId);
  });
}
