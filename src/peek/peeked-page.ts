import type { PeekFrameReport } from "../messaging/peek-messages.ts";
import { isPeekLink } from "./links.ts";
import { peekKeyCommand } from "./peek-keyboard.ts";
import { isPeekGesture } from "./peek-trigger.ts";

export type PeekedPagePorts = {
  readonly report: (report: PeekFrameReport) => Promise<void>;
};

/**
 * Runs inside the Peek's frame. Keys pressed there never reach the page showing the Peek, so Peek's
 * shortcuts are relayed; navigation is reported so "open as tab" opens the page the user is on.
 */
export function installPeekedPage(window: Window, ports: PeekedPagePorts): void {
  const report = (message: PeekFrameReport): void => {
    ports.report(message).catch((error: unknown) => console.error("Peek report failed", error));
  };

  report({ type: "peekFrame/navigated", url: window.location.href });
  window.navigation?.addEventListener("currententrychange", () =>
    report({ type: "peekFrame/navigated", url: window.location.href }),
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
  window.addEventListener(
    "click",
    (event) => {
      const link = event.composedPath().find(isPeekLink);
      if (!(link && event.isTrusted)) return;
      const navigatesOutOfPeek = link.target === "_top" || link.target === "_parent";
      if (isPeekGesture(event) || (navigatesOutOfPeek && event.button === 0)) {
        event.preventDefault();
        window.location.assign(link.href);
      }
    },
    true,
  );
}
