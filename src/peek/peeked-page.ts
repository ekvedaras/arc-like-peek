import type { PeekFrameReport } from "../messaging/peek-messages.ts";
import { isPeekLink } from "./links.ts";
import { peekKeyCommand } from "./peek-keyboard.ts";
import type { PeekHistoryChange } from "./peek-session.ts";
import { asPeekableUrl, isPeekGesture } from "./peek-trigger.ts";
import { framableUrl } from "./peek-window-address.ts";
import { staysOnPageSite } from "./peeked-page-framing.ts";

export type PeekedPagePorts = {
  readonly report: (report: PeekFrameReport) => Promise<void>;
};

/**
 * Runs inside the Peek's frame. Keys pressed there never reach the page showing the Peek, so Peek's
 * shortcuts are relayed; navigation is reported so "open as tab" opens the page the user is on.
 * A page framed by the page behind hands navigations to other sites over to the Peek window.
 */
export function installPeekedPage(window: Window, ports: PeekedPagePorts): void {
  const report = (message: PeekFrameReport): void => {
    ports.report(message).catch((error: unknown) => console.error("Peek report failed", error));
  };

  report({
    type: "peekFrame/navigated",
    url: window.location.href,
    historyChange: historyChangeOf(window.navigation?.activation?.navigationType),
  });
  window.navigation?.addEventListener("currententrychange", (event) =>
    report({
      type: "peekFrame/navigated",
      url: window.location.href,
      historyChange: historyChangeOf(event.navigationType),
    }),
  );

  const pageBehindOrigin = originOfPageFramingThis(window);
  if (pageBehindOrigin) {
    window.navigation?.addEventListener("navigate", (event) => {
      const destination = asPeekableUrl(event.destination.url);
      if (!(destination && leavesForAnotherDocument(event))) return;
      if (staysOnPageSite(pageBehindOrigin, destination)) return;
      event.preventDefault();
      report({ type: "peekFrame/leavingPageSite", url: destination });
    });
  }

  window.addEventListener(
    "keydown",
    (event) => {
      const command = peekKeyCommand(event);
      if (command === "expand") {
        event.preventDefault();
        report({ type: "peekFrame/keyCommand", command });
      }
      if (command === "dismiss") {
        // Wait for the page's own handlers: Esc it uses itself (closing its menu, say) must not close the Peek.
        window.setTimeout(() => {
          if (!event.defaultPrevented) report({ type: "peekFrame/keyCommand", command });
        });
      }
    },
    true,
  );

  // The frame is sandboxed against navigating the page behind it, so links that target it stay here.
  // Plain-http links are upgraded, because the Peek window would block them as mixed content.
  window.addEventListener(
    "click",
    (event) => {
      const link = event.composedPath().find(isPeekLink);
      if (!(link && event.isTrusted)) return;
      const url = asPeekableUrl(link.href);
      if (!url) return;
      const navigatesOutOfPeek = link.target === "_top" || link.target === "_parent";
      const isPlainClick = event.button === 0 && !hasModifier(event);
      const needsUpgrade = framableUrl(url) !== url;
      if (isPeekGesture(event) || (isPlainClick && (navigatesOutOfPeek || needsUpgrade))) {
        event.preventDefault();
        window.location.assign(framableUrl(url));
      }
    },
    true,
  );
}

/**
 * The origin of the page behind the Peek when that page frames this one itself, or null when the
 * Peek window does (then any navigation is allowed and nothing needs to be done).
 */
function originOfPageFramingThis(window: Window): string | null {
  if (window.parent !== window.top) return null;
  return window.location.ancestorOrigins[0] ?? null;
}

/**
 * Navigations the Peek window can take over: a GET of another document the page itself started.
 * Form posts go ahead in place, as a GET could not carry them.
 */
function leavesForAnotherDocument(event: NavigateEvent): boolean {
  return (
    event.cancelable &&
    !event.hashChange &&
    event.downloadRequest === null &&
    event.formData === null &&
    (event.navigationType === "push" || event.navigationType === "replace")
  );
}

function hasModifier(event: MouseEvent): boolean {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function historyChangeOf(navigationType: NavigationType | null | undefined): PeekHistoryChange {
  switch (navigationType) {
    case "push":
      return "entryAdded";
    case "replace":
    case "reload":
      return "entryReplaced";
    default:
      return "untracked";
  }
}
