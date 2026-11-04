import type { PeekedPageNotice, PeekHostNotice } from "../messaging/peek-messages.ts";

const TOP_FRAME_ID = 0;

/** Opens `url` in a new tab right after `tabId`, without switching to it. Returns the new tab's id. */
export async function openBackgroundTabNextTo(tabId: number, url: string): Promise<number> {
  const tab = await chrome.tabs.get(tabId);
  const opened = await chrome.tabs.create({
    url,
    index: tab.index + 1,
    openerTabId: tabId,
    windowId: tab.windowId,
    active: false,
  });
  if (opened.id === undefined) throw new Error("Chrome opened a tab without an id");
  return opened.id;
}

/** Resolves once the tab's page has finished loading (or the tab is gone). */
export function tabFinishedLoading(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const finish = (): void => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      resolve();
    };
    const onUpdated = (updatedTabId: number, change: chrome.tabs.OnUpdatedInfo): void => {
      if (updatedTabId === tabId && change.status === "complete") finish();
    };
    const onRemoved = (removedTabId: number): void => {
      if (removedTabId === tabId) finish();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.get(tabId).then(
      (tab) => {
        if (tab.status === "complete") finish();
      },
      () => finish(),
    );
  });
}

export async function switchToTab(tabId: number): Promise<void> {
  await chrome.tabs.update(tabId, { active: true });
}

export async function notifyTopFrame(tabId: number, notice: PeekHostNotice): Promise<void> {
  await chrome.tabs.sendMessage(tabId, notice, { frameId: TOP_FRAME_ID });
}

export async function reloadPeekedPage(tabId: number, frameId: number): Promise<void> {
  const notice: PeekedPageNotice = { type: "peekedPageNotice/reload" };
  await chrome.tabs.sendMessage(tabId, notice, { frameId });
}

export function onTabClosed(listener: (tabId: number) => void): void {
  chrome.tabs.onRemoved.addListener((tabId) => listener(tabId));
}

/**
 * Fires when the tab's top-level page has been replaced by another document. Not tabs.onUpdated:
 * it also reports `status: "loading"` with the tab's unchanged URL when a frame in the page
 * navigates, such as a form posted inside the Peek (seen 2026-11-04, Chrome 153).
 */
export function onTopFrameNavigated(listener: (tabId: number) => void): void {
  chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId === TOP_FRAME_ID) listener(details.tabId);
  });
}
