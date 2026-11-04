import { installPeek } from "../peek/peek.ts";
import { onPeekHostNotice, sendToServiceWorker } from "./extension-messaging-adapter.ts";

const INJECTION_MARKER = "arcLikePeek";

document.documentElement.dataset[INJECTION_MARKER] = "ready";
installPeek(document, {
  requestFromServiceWorker: sendToServiceWorker,
  onNotice: onPeekHostNotice,
});
