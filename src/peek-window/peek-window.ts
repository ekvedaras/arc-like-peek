import { sendToServiceWorker } from "../content/extension-messaging-adapter.ts";
import { PEEK_FRAME_NAME } from "../messaging/peek-messages.ts";
import { peekKeyCommand } from "../peek/peek-keyboard.ts";
import { framableUrl, peekedUrlFrom } from "../peek/peek-window-address.ts";
import { PEEKED_PAGE_PERMISSIONS } from "../peek/peeked-page-permissions.ts";

/**
 * Sandboxing keeps the peeked page's frame-busting scripts from navigating the page behind it,
 * while every other capability a normal page needs stays available.
 */
const PEEKED_PAGE_SANDBOX = [
  "allow-downloads",
  "allow-forms",
  "allow-modals",
  "allow-orientation-lock",
  "allow-pointer-lock",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-presentation",
  "allow-same-origin",
  "allow-scripts",
  "allow-storage-access-by-user-activation",
].join(" ");

const url = peekedUrlFrom(window.location.href);
if (url) {
  const peekedPage = document.createElement("iframe");
  peekedPage.name = PEEK_FRAME_NAME;
  peekedPage.title = "Peeked page";
  peekedPage.setAttribute("sandbox", PEEKED_PAGE_SANDBOX);
  peekedPage.allow = PEEKED_PAGE_PERMISSIONS;
  peekedPage.src = framableUrl(url);
  document.body.append(peekedPage);

  // The Peek focuses this window when it opens; keys belong to the page the user is peeking at.
  const focusPeekedPage = () => {
    peekedPage.contentWindow?.focus();
  };
  focusPeekedPage();
  window.addEventListener("focus", focusPeekedPage);
  // Committing the peeked page's document swaps the frame's process, which on Linux drops the frame's focus.
  peekedPage.addEventListener("load", focusPeekedPage);

  // Until the peeked page has loaded, keys land here or in its blank placeholder document, where no
  // content script listens; Esc must close the Peek even while a slow page is still loading.
  relayPeekKeys(window);
  if (peekedPage.contentWindow) relayPeekKeys(peekedPage.contentWindow);
}

function relayPeekKeys(target: Window): void {
  target.addEventListener(
    "keydown",
    (event) => {
      const command = peekKeyCommand(event);
      if (!command) return;
      event.preventDefault();
      sendToServiceWorker({ type: "peekFrame/keyCommand", command }).catch((error: unknown) =>
        console.error("Peek key relay failed", error),
      );
    },
    true,
  );
}
