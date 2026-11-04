import {
  firstPartyCookiesFor,
  onFirstPartyCookieChanged,
  removeFirstPartyCookie,
  takeBackLentCookie,
  topLevelSiteOf,
  writeCookie,
} from "./cookies-adapter.ts";
import { onFrameNavigating, onSetCookieResponse } from "./frame-requests-adapter.ts";
import {
  grantFramingAllowance,
  withdrawAllFramingAllowances,
  withdrawFramingAllowance,
} from "./framing-rules-adapter.ts";
import { loadOpenPeeks, saveOpenPeeks } from "./open-peeks-store.ts";
import { framingAllowanceFor } from "./peek-framing-policy.ts";
import { type PeekRelayPorts, relayPeekMessage } from "./peek-relay.ts";
import { createPeekSignInSharing } from "./peek-sign-in-sharing.ts";
import { onExtensionStarted, onPeekMessage } from "./runtime-adapter.ts";
import {
  notifyTopFrame,
  onTabClosed,
  onTopFrameNavigated,
  openBackgroundTabNextTo,
  reloadPeekedPage,
  switchToTab,
  tabFinishedLoading,
} from "./tabs-adapter.ts";

const signInSharing = createPeekSignInSharing({
  topLevelSiteOf,
  firstPartyCookiesFor,
  writeCookie,
  removeFirstPartyCookie,
  takeBackLentCookie,
  loadOpenPeeks,
  saveOpenPeeks,
  nowSeconds: () => Math.floor(Date.now() / 1000),
});

const ports: PeekRelayPorts = {
  grantFraming: grantFramingAllowance,
  withdrawFraming: withdrawFramingAllowance,
  peekOpening: signInSharing.peekOpening,
  peekWindowOpened: signInSharing.peekWindowOpened,
  peekClosed: signInSharing.peekClosed,
  peekedPageLoaded: signInSharing.peekedPageLoaded,
  reloadPeekedPage,
  openBackgroundTabNextTo,
  tabFinishedLoading,
  switchToTab,
  elapse: (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
  notifyTopFrame,
};

const reportFailure =
  (what: string, ...context: unknown[]) =>
  (error: unknown): void =>
    console.error(what, ...context, error);

onPeekMessage((message, sender) => relayPeekMessage(ports, message, sender));

onFrameNavigating((tabId, navigation) => {
  signInSharing
    .frameNavigating(tabId, navigation)
    .catch(reportFailure("Could not lend cookies to the Peek", tabId, navigation.url.href));
});
onSetCookieResponse((response) => {
  signInSharing
    .responseReceived(response)
    .catch(reportFailure("Could not keep cookies set in the Peek", response.url.href));
});
onFirstPartyCookieChanged((cookie, removed) => {
  signInSharing
    .firstPartyCookieChanged(cookie, removed)
    .catch(reportFailure("Could not update cookies lent to a Peek", cookie.name));
});

// A Peek normally revokes its own access on close; these cover pages that go away while peeking.
const revokePeekAccessInTab = (tabId: number): void => {
  withdrawFramingAllowance(framingAllowanceFor(tabId)).catch(
    reportFailure("Could not withdraw framing allowance", tabId),
  );
  signInSharing.peekClosed(tabId).catch(reportFailure("Could not take back lent cookies", tabId));
};
onTabClosed(revokePeekAccessInTab);
onTopFrameNavigated(revokePeekAccessInTab);
onExtensionStarted(() => {
  withdrawAllFramingAllowances().catch(reportFailure("Could not clear framing allowances"));
  signInSharing.forgetAllPeeks().catch(reportFailure("Could not take back lent cookies"));
});
