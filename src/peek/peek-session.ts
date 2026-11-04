import type { PeekableUrl } from "./peek-trigger.ts";

/**
 * Lifecycle of the one Peek a page can show. `Origin` is whatever the Peek grows from and returns
 * focus to (a link element in the browser); the session never inspects it, which keeps this module
 * free of the DOM.
 */
export type PeekSession<Origin> =
  | { readonly phase: "closed" }
  | { readonly phase: "opening"; readonly peek: PeekedPage<Origin> }
  | { readonly phase: "open"; readonly peek: PeekedPage<Origin> }
  | { readonly phase: "closing"; readonly peek: PeekedPage<Origin> }
  | { readonly phase: "expanding"; readonly peek: PeekedPage<Origin> };

export type PeekPhase = PeekSession<unknown>["phase"];

export type PeekedPage<Origin> = {
  /** The page currently shown, which changes as the user navigates inside the Peek. */
  readonly url: PeekableUrl;
  readonly origin: Origin;
  readonly historyTrail: PeekHistoryTrail;
};

/**
 * How a navigation inside the Peek changed the tab's back/forward history. A frame shares its tab's
 * history, so each page visited inside the Peek is an entry there. `untracked`: the user went back
 * or forward, or the page could not tell.
 */
export type PeekHistoryChange = "entryAdded" | "entryReplaced" | "untracked";

/**
 * What the Peek has left in the tab's history. Its entries outlive the Peek, so Back on the page
 * would seem to do nothing until they are rewound. Once untracked, rewinding could leave the page.
 */
export type PeekHistoryTrail =
  | { readonly kind: "entriesAdded"; readonly count: number }
  | { readonly kind: "untracked" };

const NO_HISTORY_TRAIL: PeekHistoryTrail = { kind: "entriesAdded", count: 0 };

export type DismissMechanism = "escapeKey" | "backdropClick" | "closeButton";

export type PeekEvent<Origin> =
  | { readonly type: "peekRequested"; readonly url: PeekableUrl; readonly origin: Origin }
  | { readonly type: "openSettled" }
  | {
      readonly type: "peekNavigated";
      readonly url: PeekableUrl;
      readonly historyChange: PeekHistoryChange;
    }
  /**
   * The peeked page, framed by the page behind because it is on that page's site, is going to
   * another site, where the page behind's CSP could block it.
   */
  | { readonly type: "peekLeavingPageSite"; readonly url: PeekableUrl }
  | { readonly type: "dismissRequested"; readonly via: DismissMechanism }
  | { readonly type: "dismissSettled" }
  | { readonly type: "expandRequested" }
  | { readonly type: "expandSettled" };

export type PeekEffect<Origin> =
  | { readonly kind: "presentOverlay"; readonly origin: Origin; readonly url: PeekableUrl }
  | { readonly kind: "allowFraming" }
  | { readonly kind: "loadPage"; readonly url: PeekableUrl }
  /** Shows `url` through the Peek window instead, in place of the page the Peek shows now. */
  | { readonly kind: "loadPageInPeekWindow"; readonly url: PeekableUrl }
  | { readonly kind: "dismissOverlay"; readonly origin: Origin }
  | { readonly kind: "expandOverlay" }
  | { readonly kind: "openInTab"; readonly url: PeekableUrl }
  | { readonly kind: "removeOverlay" }
  | { readonly kind: "rewindHistory"; readonly entries: number }
  | { readonly kind: "revokeFraming" }
  | { readonly kind: "returnFocus"; readonly origin: Origin };

export type PeekTransition<Origin> = {
  readonly session: PeekSession<Origin>;
  readonly effects: readonly PeekEffect<Origin>[];
};

export const CLOSED_PEEK: PeekSession<never> = { phase: "closed" };

/** The whole Peek lifecycle: what happens to a session when something happens to the Peek. */
export function advancePeek<Origin>(
  session: PeekSession<Origin>,
  event: PeekEvent<Origin>,
): PeekTransition<Origin> {
  switch (session.phase) {
    case "closed":
      return event.type === "peekRequested"
        ? startPeek(event.url, event.origin)
        : unchanged(session);
    case "opening":
    case "open":
      return advanceShownPeek(session, event);
    case "closing":
      return event.type === "dismissSettled" ? finishDismiss(session.peek) : unchanged(session);
    case "expanding":
      return event.type === "expandSettled" ? finishExpand(session.peek) : unchanged(session);
  }
}

type ShownPeek<Origin> = Extract<PeekSession<Origin>, { phase: "opening" | "open" }>;

function advanceShownPeek<Origin>(
  session: ShownPeek<Origin>,
  event: PeekEvent<Origin>,
): PeekTransition<Origin> {
  const { peek } = session;
  switch (event.type) {
    case "openSettled":
      return { session: { phase: "open", peek }, effects: [] };
    case "peekNavigated": {
      const historyTrail = followHistory(peek.historyTrail, event.historyChange);
      return {
        session: { ...session, peek: { ...peek, url: event.url, historyTrail } },
        effects: [],
      };
    }
    case "peekLeavingPageSite":
      return {
        session: { ...session, peek: { ...peek, url: event.url } },
        effects: [{ kind: "loadPageInPeekWindow", url: event.url }],
      };
    case "dismissRequested":
      return {
        session: { phase: "closing", peek },
        effects: [{ kind: "dismissOverlay", origin: peek.origin }],
      };
    case "expandRequested":
      return { session: { phase: "expanding", peek }, effects: [{ kind: "expandOverlay" }] };
    default:
      return unchanged(session);
  }
}

function startPeek<Origin>(url: PeekableUrl, origin: Origin): PeekTransition<Origin> {
  return {
    session: { phase: "opening", peek: { url, origin, historyTrail: NO_HISTORY_TRAIL } },
    effects: [
      { kind: "presentOverlay", origin, url },
      { kind: "allowFraming" },
      { kind: "loadPage", url },
    ],
  };
}

function finishDismiss<Origin>(peek: PeekedPage<Origin>): PeekTransition<Origin> {
  return {
    session: CLOSED_PEEK,
    effects: [
      { kind: "removeOverlay" },
      ...rewindHistory(peek.historyTrail),
      { kind: "revokeFraming" },
      { kind: "returnFocus", origin: peek.origin },
    ],
  };
}

function finishExpand<Origin>(peek: PeekedPage<Origin>): PeekTransition<Origin> {
  return {
    session: CLOSED_PEEK,
    effects: [
      { kind: "openInTab", url: peek.url },
      { kind: "removeOverlay" },
      ...rewindHistory(peek.historyTrail),
      { kind: "revokeFraming" },
    ],
  };
}

function followHistory(trail: PeekHistoryTrail, change: PeekHistoryChange): PeekHistoryTrail {
  if (trail.kind === "untracked" || change === "untracked") return { kind: "untracked" };
  return change === "entryAdded" ? { kind: "entriesAdded", count: trail.count + 1 } : trail;
}

/** Once the Peek's frame is gone, stepping back over its entries is invisible and restores Back. */
function rewindHistory(
  trail: PeekHistoryTrail,
): readonly Extract<PeekEffect<never>, { kind: "rewindHistory" }>[] {
  return trail.kind === "entriesAdded" && trail.count > 0
    ? [{ kind: "rewindHistory", entries: trail.count }]
    : [];
}

function unchanged<Origin>(session: PeekSession<Origin>): PeekTransition<Origin> {
  return { session, effects: [] };
}
