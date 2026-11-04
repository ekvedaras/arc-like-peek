import {
  dismissChoreography,
  expandChoreography,
  type MotionPreference,
  type MotionStep,
  type OverlayPart,
  openChoreography,
} from "../choreography.ts";
import {
  type BoxTransform,
  type PeekLayout,
  type Point,
  peekLayout,
  peekOriginRect,
  type Rect,
  viewportWithinPane,
} from "../geometry.ts";
import type { PeekLink } from "../links.ts";
import { PEEK_MOTION } from "../motion-tokens.ts";
import { type PeekKeyCommand, peekKeyCommand } from "../peek-keyboard.ts";
import type { DismissMechanism, PeekPhase } from "../peek-session.ts";
import type { PeekableUrl } from "../peek-trigger.ts";
import { PEEKED_PAGE_PERMISSIONS } from "../peeked-page-permissions.ts";
import { type ControlIcon, createControlIcon } from "./control-icons.ts";
import { PEEK_OVERLAY_STYLES } from "./peek-overlay-styles.ts";
import { lockPageScroll, type ScrollLock } from "./scroll-lock.ts";

/** The link a Peek grows out of, shrinks back into and returns focus to. */
export type PeekOrigin = {
  readonly link: PeekLink;
  readonly pointer: Point | null;
};

export type PeekOverlayIntents = {
  readonly dismiss: (via: DismissMechanism) => void;
  readonly expand: () => void;
};

/** The overlay on screen. Each motion resolves when it has settled and rejects if interrupted. */
export type PeekOverlay = {
  readonly present: (origin: PeekOrigin) => Promise<void>;
  readonly load: (url: PeekableUrl) => void;
  /** The peeked page has shown its first content: whatever waited for it may move now. */
  readonly pagePainted: () => void;
  readonly dismiss: (origin: PeekOrigin) => Promise<void>;
  readonly expand: () => Promise<void>;
  readonly remove: () => void;
  /** Mirrors the session phase on the overlay, for debugging and for e2e specs to wait on. */
  readonly reflectPhase: (phase: PeekPhase) => void;
};

const HOST_TAG = "arc-like-peek";

/** Where the Peek's frame goes to show a page: the Peek window, which hosts the page itself. */
export type PeekWindowAddressing = (url: PeekableUrl) => string;

export function mountPeekOverlay(
  document: Document,
  intents: PeekOverlayIntents,
  peekWindowAddressFor: PeekWindowAddressing,
): PeekOverlay {
  const parts = buildOverlay(document, intents);
  document.documentElement.append(parts.host);

  let layout: PeekLayout | null = null;
  let scrollLock: ScrollLock | null = null;
  let running: Animation[] = [];
  let heldUntilPainted: Animation[] = [];
  let firstPaintTimer: number | undefined;

  const view = document.defaultView;
  const motionPreference = (): MotionPreference =>
    view?.matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full";

  const viewport = (): Rect => ({
    x: 0,
    y: 0,
    width: parts.dialog.clientWidth,
    height: parts.dialog.clientHeight,
  });

  const applyLayout = (): PeekLayout => {
    const next = peekLayout(viewport());
    placeAt(parts.pane, next.pane);
    parts.controls.style.left = `${next.controlsRail.x}px`;
    parts.controls.style.top = `${next.controlsRail.y}px`;
    parts.controls.dataset["position"] = next.controlsRail.position;
    layout = next;
    return next;
  };

  const originRect = (origin: PeekOrigin): Rect | null => {
    if (!origin.link.isConnected) return null;
    return peekOriginRect([...origin.link.getClientRects()], origin.pointer, viewport());
  };

  const releaseHeldMotion = (): void => {
    view?.clearTimeout(firstPaintTimer);
    for (const animation of heldUntilPainted) animation.play();
    heldUntilPainted = [];
  };

  const play = (steps: readonly MotionStep[]): Promise<void> => {
    for (const animation of running) {
      animation.commitStyles();
      animation.cancel();
    }
    heldUntilPainted = [];
    running = steps.map((step) => {
      const animation = partElement(parts, step.part).animate([...step.keyframes], {
        ...step.timing,
      });
      if (step.cue === "oncePagePainted") {
        // Paused at its first frame, so the part shows where it starts from until released.
        animation.pause();
        heldUntilPainted.push(animation);
      }
      return animation;
    });
    if (heldUntilPainted.length > 0) {
      view?.clearTimeout(firstPaintTimer);
      firstPaintTimer = view?.setTimeout(releaseHeldMotion, PEEK_MOTION.firstPaintWait);
    }
    return Promise.all(running.map((animation) => animation.finished)).then(() => {});
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const command = peekKeyCommand(event);
    if (!command) return;
    event.preventDefault();
    event.stopPropagation();
    performKeyCommand(intents, command);
  };
  const onCancel = (event: Event): void => {
    event.preventDefault();
    intents.dismiss("escapeKey");
  };
  const onResize = (): void => {
    if (layout) applyLayout();
  };

  return {
    present: (origin) => {
      parts.dialog.addEventListener("cancel", onCancel);
      document.addEventListener("keydown", onKeyDown, true);
      // Focus moves into the frame, whose blank placeholder no script of ours watches until the Peek
      // window has loaded; Esc must still close a Peek that is only just opening.
      parts.page.contentWindow?.addEventListener("keydown", onKeyDown, true);
      view?.addEventListener("resize", onResize);
      scrollLock = lockPageScroll(document);
      parts.dialog.showModal();
      const { pane } = applyLayout();
      return play(openChoreography(pane, originRect(origin), motionPreference()));
    },
    load: (url) => {
      parts.page.src = peekWindowAddressFor(url);
    },
    pagePainted: releaseHeldMotion,
    dismiss: (origin) => {
      const pane = (layout ?? applyLayout()).pane;
      return play(dismissChoreography(pane, originRect(origin), motionPreference()));
    },
    expand: () => {
      const pane = (layout ?? applyLayout()).pane;
      const paneNow = currentTransformOf(parts.pane);
      // One reflow, into the layout the tab will have, before anything moves; never during the motion.
      placeAt(parts.page, viewportWithinPane(pane, viewport()));
      return play(expandChoreography(pane, viewport(), paneNow, motionPreference()));
    },
    remove: () => {
      view?.clearTimeout(firstPaintTimer);
      for (const animation of running) animation.cancel();
      running = [];
      heldUntilPainted = [];
      parts.dialog.removeEventListener("cancel", onCancel);
      document.removeEventListener("keydown", onKeyDown, true);
      view?.removeEventListener("resize", onResize);
      if (parts.dialog.open) parts.dialog.close();
      parts.host.remove();
      scrollLock?.release();
      scrollLock = null;
    },
    reflectPhase: (phase) => {
      parts.host.dataset["peekPhase"] = phase;
    },
  };
}

export function performKeyCommand(intents: PeekOverlayIntents, command: PeekKeyCommand): void {
  if (command === "dismiss") intents.dismiss("escapeKey");
  else intents.expand();
}

type OverlayParts = {
  readonly host: HTMLElement;
  readonly dialog: HTMLDialogElement;
  readonly scrim: HTMLDivElement;
  readonly pane: HTMLDivElement;
  readonly page: HTMLIFrameElement;
  readonly controls: HTMLDivElement;
};

function buildOverlay(document: Document, intents: PeekOverlayIntents): OverlayParts {
  const host = document.createElement(HOST_TAG);
  const shadow = host.attachShadow({ mode: "open" });
  const styles = new CSSStyleSheet();
  styles.replaceSync(PEEK_OVERLAY_STYLES);
  shadow.adoptedStyleSheets = [styles];

  const dialog = element(document, "dialog", "peek-dialog");
  dialog.setAttribute("aria-label", "Peek");

  const scrim = element(document, "div", "peek-scrim");
  scrim.addEventListener("click", () => intents.dismiss("backdropClick"));

  const pane = element(document, "div", "peek-pane");
  const page = element(document, "iframe", "peek-page");
  page.title = "Peek";
  page.allow = PEEKED_PAGE_PERMISSIONS;
  page.autofocus = true;
  pane.append(page);

  const controls = element(document, "div", "peek-controls");
  controls.setAttribute("role", "toolbar");
  controls.setAttribute("aria-label", "Peek controls");
  controls.append(
    controlButton(document, "close", "Close Peek (Esc)", () => intents.dismiss("closeButton")),
    controlButton(document, "expand", "Open as tab (⌘O)", intents.expand),
  );

  dialog.append(scrim, pane, controls);
  shadow.append(dialog);
  return { host, dialog, scrim, pane, page, controls };
}

function controlButton(
  document: Document,
  icon: ControlIcon,
  label: string,
  onPress: () => void,
): HTMLButtonElement {
  const button = element(document, "button", "peek-control");
  button.type = "button";
  button.dataset["control"] = icon;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.append(createControlIcon(document, icon));
  button.addEventListener("click", onPress);
  return button;
}

function element<Tag extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: Tag,
  className: string,
): HTMLElementTagNameMap[Tag] {
  const created = document.createElement(tag);
  created.className = className;
  return created;
}

function placeAt(target: HTMLElement, rect: Rect): void {
  target.style.left = `${rect.x}px`;
  target.style.top = `${rect.y}px`;
  target.style.width = `${rect.width}px`;
  target.style.height = `${rect.height}px`;
}

function currentTransformOf(target: HTMLElement): BoxTransform {
  const { transform } = getComputedStyle(target);
  const matrix = new DOMMatrixReadOnly(transform === "none" ? undefined : transform);
  return { translateX: matrix.e, translateY: matrix.f, scaleX: matrix.a, scaleY: matrix.d };
}

function partElement(parts: OverlayParts, part: OverlayPart): HTMLElement {
  switch (part) {
    case "scrim":
      return parts.scrim;
    case "pane":
      return parts.pane;
    case "page":
      return parts.page;
    case "controls":
      return parts.controls;
  }
}
