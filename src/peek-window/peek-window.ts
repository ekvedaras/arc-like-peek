import { sendToServiceWorker } from "../content/extension-messaging-adapter.ts";
import { PEEK_FRAME_NAME } from "../messaging/peek-messages.ts";
import { peekKeyCommand } from "../peek/peek-keyboard.ts";
import { framableUrl, peekedUrlFrom } from "../peek/peek-window-address.ts";
import { PEEKED_PAGE_PERMISSIONS, PEEKED_PAGE_SANDBOX } from "../peek/peeked-page-permissions.ts";

// A Peek that framed a page of the page behind's site keeps its frame's name when it moves here;
// the name belongs to the frame below, so that only the peeked page answers to it.
window.name = "";

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
