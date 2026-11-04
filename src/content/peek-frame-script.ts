import { PEEK_FRAME_NAME } from "../messaging/peek-messages.ts";
import { installPeekedPage } from "../peek/peeked-page.ts";
import { sendToServiceWorker } from "./extension-messaging-adapter.ts";

if (window !== window.top && window.name === PEEK_FRAME_NAME) {
  installPeekedPage(window, { report: sendToServiceWorker });
}
