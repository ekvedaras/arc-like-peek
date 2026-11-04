import type { PeekedPageNotice, PeekFrameReport } from "../messaging/peek-messages.ts";
import { isPeekLink } from "./links.ts";
import { peekKeyCommand } from "./peek-keyboard.ts";
import type { PeekHistoryChange } from "./peek-session.ts";
import { asPeekableUrl, isPeekGesture } from "./peek-trigger.ts";
import { framableUrl } from "./peek-window-address.ts";

export type PeekedPagePorts = {
  readonly report: (report: PeekFrameReport) => Promise<void>;
  readonly onNotice: (listener: (notice: PeekedPageNotice) => void) => void;
};

/**
 * Runs inside the Peek's frame. Keys pressed there never reach the page showing the Peek, so Peek's
 * shortcuts are relayed; navigation is reported so "open as tab" opens the page the user is on.
 */
export function installPeekedPage(window: Window, ports: PeekedPagePorts): void {
  const report = (message: PeekFrameReport): void => {
    ports.report(message).catch((error: unknown) => console.error("Peek report failed", error));
  };

  ports.onNotice((notice) => {
    switch (notice.type) {
      case "peekedPageNotice/reload":
        window.location.reload();
        return;
    }
  });

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
