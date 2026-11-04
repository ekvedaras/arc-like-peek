import type { PeekHostNotice, PeekHostRequest } from "../messaging/peek-messages.ts";
import { isPeekLink } from "./links.ts";
import { mountPeekOverlay, type PeekOrigin, performKeyCommand } from "./overlay/peek-overlay.ts";
import { createPeekController } from "./peek-controller.ts";
import { asPeekableUrl, isPeekGesture, type PeekableUrl, peekableUrl } from "./peek-trigger.ts";
import { PEEK_WINDOW_PAGE, peekWindowAddress } from "./peek-window-address.ts";

export type PeekHostPorts = {
  readonly requestFromServiceWorker: (request: PeekHostRequest) => Promise<void>;
  readonly onNotice: (listener: (notice: PeekHostNotice) => void) => void;
  /** The URL of one of this extension's own pages. */
  readonly extensionPageUrl: (page: string) => string;
};

/** Lets the user shift+click any link on this page to peek at it. */
export function installPeek(document: Document, ports: PeekHostPorts): void {
  const view = document.defaultView;
  const controller = createPeekController({
    mountOverlay: (intents) =>
      mountPeekOverlay(document, intents, (url) =>
        peekWindowAddress(ports.extensionPageUrl(PEEK_WINDOW_PAGE), url),
      ),
    requestFromServiceWorker: ports.requestFromServiceWorker,
    rewindTabHistory: (entries) => view?.history.go(-entries),
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
        if (url)
          controller.dispatch({ type: "peekNavigated", url, historyChange: notice.historyChange });
        return;
      }
      case "peekHostNotice/keyCommand":
        performKeyCommand(controller.intents, notice.command);
        return;
      case "peekHostNotice/framePainted":
        controller.pagePainted();
        return;
    }
  });
}
