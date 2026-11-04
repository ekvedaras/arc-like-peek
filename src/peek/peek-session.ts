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
};

export type DismissMechanism = "escapeKey" | "backdropClick" | "closeButton";

export type PeekEvent<Origin> =
  | { readonly type: "peekRequested"; readonly url: PeekableUrl; readonly origin: Origin }
  | { readonly type: "openSettled" }
  | { readonly type: "peekNavigated"; readonly url: PeekableUrl }
  | { readonly type: "dismissRequested"; readonly via: DismissMechanism }
  | { readonly type: "dismissSettled" }
  | { readonly type: "expandRequested" }
  | { readonly type: "expandSettled" };

export type PeekEffect<Origin> =
  | { readonly kind: "presentOverlay"; readonly origin: Origin }
  | { readonly kind: "allowFraming" }
  | { readonly kind: "loadPage"; readonly url: PeekableUrl }
  | { readonly kind: "dismissOverlay"; readonly origin: Origin }
  | { readonly kind: "expandOverlay" }
  | { readonly kind: "openInTab"; readonly url: PeekableUrl }
  | { readonly kind: "removeOverlay" }
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
    case "peekNavigated":
      return { session: { ...session, peek: { ...peek, url: event.url } }, effects: [] };
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
    session: { phase: "opening", peek: { url, origin } },
    effects: [
      { kind: "presentOverlay", origin },
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
      { kind: "revokeFraming" },
    ],
  };
}

function unchanged<Origin>(session: PeekSession<Origin>): PeekTransition<Origin> {
  return { session, effects: [] };
}
