import type { PeekHostRequest } from "../messaging/peek-messages.ts";
import type { PeekOrigin, PeekOverlay, PeekOverlayIntents } from "./overlay/peek-overlay.ts";
import {
  advancePeek,
  CLOSED_PEEK,
  type PeekEffect,
  type PeekEvent,
  type PeekSession,
} from "./peek-session.ts";

export type PeekControllerPorts = {
  readonly mountOverlay: (intents: PeekOverlayIntents) => PeekOverlay;
  readonly requestFromServiceWorker: (request: PeekHostRequest) => Promise<void>;
  /** Steps the tab's history back without leaving the page, over entries only the Peek used. */
  readonly rewindTabHistory: (entries: number) => void;
};

export type PeekController = {
  readonly dispatch: (event: PeekEvent<PeekOrigin>) => void;
  /** What the user can ask of the Peek from its controls or keyboard. */
  readonly intents: PeekOverlayIntents;
};

/**
 * The imperative shell around the pure Peek session: feeds it events, then carries out the effects
 * it asks for, one after another, so framing is always allowed before a page loads and revoked after.
 */
export function createPeekController(ports: PeekControllerPorts): PeekController {
  let session: PeekSession<PeekOrigin> = CLOSED_PEEK;
  let overlay: PeekOverlay | null = null;
  let pendingEffects: Promise<void> = Promise.resolve();

  const intents: PeekOverlayIntents = {
    dismiss: (via) => dispatch({ type: "dismissRequested", via }),
    expand: () => dispatch({ type: "expandRequested" }),
  };

  const dispatchWhenSettled = (motion: Promise<void>, event: PeekEvent<PeekOrigin>): void => {
    motion.then(
      () => dispatch(event),
      () => {},
    );
  };

  const perform = async (effect: PeekEffect<PeekOrigin>): Promise<void> => {
    switch (effect.kind) {
      case "presentOverlay":
        overlay = ports.mountOverlay(intents);
        overlay.reflectPhase(session.phase);
        dispatchWhenSettled(overlay.present(effect.origin), { type: "openSettled" });
        return;
      case "allowFraming":
        await ports.requestFromServiceWorker({ type: "peekHost/allowFraming" });
        return;
      case "loadPage":
        overlay?.load(effect.url);
        return;
      case "dismissOverlay":
        if (overlay)
          dispatchWhenSettled(overlay.dismiss(effect.origin), { type: "dismissSettled" });
        return;
      case "expandOverlay":
        if (overlay) dispatchWhenSettled(overlay.expand(), { type: "expandSettled" });
        return;
      case "openInTab":
        await ports.requestFromServiceWorker({ type: "peekHost/openInTab", url: effect.url });
        return;
      case "removeOverlay":
        overlay?.remove();
        overlay = null;
        return;
      case "rewindHistory":
        ports.rewindTabHistory(effect.entries);
        return;
      case "revokeFraming":
        await ports.requestFromServiceWorker({ type: "peekHost/revokeFraming" });
        return;
      case "returnFocus":
        effect.origin.link.focus({ preventScroll: true, focusVisible: false });
        return;
    }
  };

  const dispatch = (event: PeekEvent<PeekOrigin>): void => {
    const transition = advancePeek(session, event);
    session = transition.session;
    overlay?.reflectPhase(session.phase);
    for (const effect of transition.effects) {
      pendingEffects = pendingEffects
        .then(() => perform(effect))
        .catch((error: unknown) => console.error("Peek effect failed", effect.kind, error));
    }
  };

  return { dispatch, intents };
}
