import type { PeekHostNotice, PeekHostRequest } from "../messaging/peek-messages.ts";
import { isPeekLink } from "./links.ts";
import { mountPeekOverlay, type PeekOrigin, performKeyCommand } from "./overlay/peek-overlay.ts";
import { createPeekController } from "./peek-controller.ts";
import { asPeekableUrl, isPeekGesture, type PeekableUrl, peekableUrl } from "./peek-trigger.ts";

export type PeekHostPorts = {
  readonly requestFromServiceWorker: (request: PeekHostRequest) => Promise<void>;
  readonly onNotice: (listener: (notice: PeekHostNotice) => void) => void;
};

/** Lets the user shift+click any link on this page to peek at it. */
export function installPeek(document: Document, ports: PeekHostPorts): void {
  const controller = createPeekController({
    mountOverlay: (intents) => mountPeekOverlay(document, intents),
    requestFromServiceWorker: ports.requestFromServiceWorker,
  });

  const peekTriggeredBy = (event: MouseEvent): { url: PeekableUrl; origin: PeekOrigin } | null => {
    if (!(event.isTrusted && isPeekGesture(event))) return null;
    const link = event.composedPath().find(isPeekLink);
    if (!link) return null;
    const url = peekableUrl({
      href: link.href,
      hasDownloadAttribute: link.hasAttribute("download"),
      pageUrl: document.URL,
    });
    return url ? { url, origin: { link, pointer: { x: event.clientX, y: event.clientY } } } : null;
  };

  // Capturing on the window runs before the page's own handlers, which might navigate or cancel.
  const view = document.defaultView;
  view?.addEventListener(
    "mousedown",
    (event) => {
      // Shift+mousedown would otherwise extend the text selection up to the link.
      if (peekTriggeredBy(event)) event.preventDefault();
    },
    true,
  );
  view?.addEventListener(
    "click",
    (event) => {
      const trigger = peekTriggeredBy(event);
      if (!trigger) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      controller.dispatch({ type: "peekRequested", ...trigger });
    },
    true,
  );

  ports.onNotice((notice) => {
    switch (notice.type) {
      case "peekHostNotice/frameNavigated": {
        const url = asPeekableUrl(notice.url);
        if (url) controller.dispatch({ type: "peekNavigated", url });
        return;
      }
      case "peekHostNotice/keyCommand":
        performKeyCommand(controller.intents, notice.command);
        return;
    }
  });
}
