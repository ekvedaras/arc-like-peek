import type { FrameNavigation } from "./peek-sign-in.ts";
import type { SetCookieResponse } from "./peek-sign-in-sharing.ts";

const NOT_IN_A_TAB = -1;

/** Every frame in every tab that starts loading a page, redirects included. */
export function onFrameNavigating(
  listener: (tabId: number, navigation: FrameNavigation) => void,
): void {
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (details.tabId === NOT_IN_A_TAB) return;
      listener(details.tabId, {
        frameId: details.frameId,
        parentFrameId: details.parentFrameId,
        url: new URL(details.url),
      });
    },
    { urls: ["<all_urls>"], types: ["sub_frame"] },
  );
}

/** Responses in tabs that set cookies. `extraHeaders` is what makes `Set-Cookie` visible. */
export function onSetCookieResponse(listener: (response: SetCookieResponse) => void): void {
  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      if (details.tabId === NOT_IN_A_TAB) return;
      const setCookieHeaders = (details.responseHeaders ?? []).flatMap((header) =>
        header.name.toLowerCase() === "set-cookie" && header.value !== undefined
          ? [header.value]
          : [],
      );
      if (setCookieHeaders.length === 0) return;
      listener({
        tabId: details.tabId,
        frameId: details.frameId,
        url: new URL(details.url),
        redirectsFrame: details.type === "sub_frame" && isRedirect(details.statusCode),
        setCookieHeaders,
      });
    },
    { urls: ["<all_urls>"] },
    ["responseHeaders", "extraHeaders"],
  );
}

function isRedirect(statusCode: number): boolean {
  return statusCode >= 300 && statusCode < 400;
}
