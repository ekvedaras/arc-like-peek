import { PEEK_FRAME_NAME } from "../../messaging/peek-messages.ts";
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
  type PeekOriginShape,
  type Point,
  peekLayout,
  peekOriginRect,
  type Rect,
  viewportWithinPane,
} from "../geometry.ts";
import type { PeekLink } from "../links.ts";
import { type PeekKeyCommand, peekKeyCommand } from "../peek-keyboard.ts";
import type { DismissMechanism, PeekPhase } from "../peek-session.ts";
import { type ColourScheme, peekTint } from "../peek-tint.ts";
import type { PeekableUrl } from "../peek-trigger.ts";
import type { PeekedPageFraming } from "../peeked-page-framing.ts";
import { PEEKED_PAGE_PERMISSIONS, PEEKED_PAGE_SANDBOX } from "../peeked-page-permissions.ts";
import { type ControlIcon, createControlIcon } from "./control-icons.ts";
import { cssColourParser, pageColour } from "./page-colour.ts";
import { PEEK_OVERLAY_STYLES } from "./peek-overlay-styles.ts";
import { type RowSnapshot, rowOf, snapshotRow } from "./row-snapshot.ts";
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
  /** Replaces the page shown with `url`, framed by the Peek window, without a new history entry. */
  readonly loadInPeekWindow: (url: PeekableUrl) => void;
  readonly dismiss: (origin: PeekOrigin) => Promise<void>;
  readonly expand: () => Promise<void>;
  readonly remove: () => void;
  /** Mirrors the session phase on the overlay, for debugging and for e2e specs to wait on. */
  readonly reflectPhase: (phase: PeekPhase) => void;
};

const HOST_TAG = "arc-like-peek";

export type PeekedPageFramer = {
  /** Who frames the first page the Peek shows. */
  readonly framing: PeekedPageFraming;
  /** Where the Peek's frame goes to have the Peek window frame `url`. */
  readonly peekWindowAddressFor: (url: PeekableUrl) => string;
};

export function mountPeekOverlay(
  document: Document,
  intents: PeekOverlayIntents,
  framer: PeekedPageFramer,
): PeekOverlay {
  const parts = buildOverlay(document, intents, framer.framing);
  document.documentElement.append(parts.host);

  let layout: PeekLayout | null = null;
  let scrollLock: ScrollLock | null = null;
  let running: Animation[] = [];
  let rowSnapshot: RowSnapshot | null = null;

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
    fitSnapshot(next.pane);
    layout = next;
    return next;
  };

  const originShape = (origin: PeekOrigin): PeekOriginShape | null => {
    if (!origin.link.isConnected) return null;
    const link = peekOriginRect([...origin.link.getClientRects()], origin.pointer, viewport());
    if (!link) return null;
    return {
      link,
      rowTop: rowOf(origin.link).getBoundingClientRect().top,
      hasRowSnapshot: rowSnapshot !== null,
    };
  };

  const fitSnapshot = (pane: Rect): void => {
    if (!rowSnapshot) return;
    // The picture is stretched over the whole pane, so it is enlarged as the pane grows.
    const { rect } = rowSnapshot;
    Object.assign(parts.snapshot.style, {
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      transform: `scale(${pane.width / rect.width}, ${pane.height / rect.height})`,
    });
  };

  const applyTint = (): void => {
    const scheme: ColourScheme = view?.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    const tint = peekTint(pageColour(document, cssColourParser(parts.dialog)), scheme);
    if (!tint) return;
    const style = parts.dialog.style;
    style.setProperty("--peek-scrim-tint", tint.scrim);
    style.setProperty("--peek-control-background", tint.controlBackground);
    style.setProperty("--peek-control-background-hover", tint.controlBackgroundHover);
    style.setProperty("--peek-control-glyph", tint.controlGlyph);
  };

  const play = (steps: readonly MotionStep[]): Promise<void> => {
    for (const animation of running) {
      animation.commitStyles();
      animation.cancel();
    }
    running = steps.map((step) =>
      partElement(parts, step.part).animate([...step.keyframes], { ...step.timing }),
    );
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
  // Committing the Peek window's document swaps the frame's process, which on Linux drops the frame's focus.
  const focusPeekWindow = (): void => {
    if (parts.host.shadowRoot?.activeElement !== parts.page) parts.page.focus();
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
      rowSnapshot = origin.link.isConnected ? snapshotRow(origin.link) : null;
      if (rowSnapshot) parts.snapshot.replaceChildren(rowSnapshot.element);
      applyTint();
      scrollLock = lockPageScroll(document);
      parts.dialog.showModal();
      parts.page.addEventListener("load", focusPeekWindow);
      const { pane } = applyLayout();
      return play(openChoreography(pane, originShape(origin), motionPreference()));
    },
    load: (url) => {
      parts.page.src = framer.framing === "framedByPage" ? url : framer.peekWindowAddressFor(url);
    },
    loadInPeekWindow: (url) => {
      // Sandbox flags apply from the next navigation on; the Peek window must not be sandboxed.
      parts.page.removeAttribute("sandbox");
      parts.page.removeAttribute("name");
      parts.page.contentWindow?.location.replace(framer.peekWindowAddressFor(url));
    },
    dismiss: (origin) => {
      const pane = (layout ?? applyLayout()).pane;
      const paneNow = currentTransformOf(parts.pane);
      return play(dismissChoreography(pane, originShape(origin), paneNow, motionPreference()));
    },
    expand: () => {
      const pane = (layout ?? applyLayout()).pane;
      const paneNow = currentTransformOf(parts.pane);
      // One reflow, into the layout the tab will have, before anything moves; never during the motion.
      placeAt(parts.page, viewportWithinPane(pane, viewport()));
      return play(expandChoreography(pane, viewport(), paneNow, motionPreference()));
    },
    remove: () => {
      for (const animation of running) animation.cancel();
      running = [];
      parts.dialog.removeEventListener("cancel", onCancel);
      parts.page.removeEventListener("load", focusPeekWindow);
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
  readonly snapshot: HTMLDivElement;
  readonly controls: HTMLDivElement;
};

function buildOverlay(
  document: Document,
  intents: PeekOverlayIntents,
  framing: PeekedPageFraming,
): OverlayParts {
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
  if (framing === "framedByPage") {
    // Chrome names a frame's browsing context once, when the frame is attached.
    page.name = PEEK_FRAME_NAME;
    page.setAttribute("sandbox", PEEKED_PAGE_SANDBOX);
  }
  page.title = "Peek";
  page.allow = PEEKED_PAGE_PERMISSIONS;
  page.autofocus = true;
  const snapshot = element(document, "div", "peek-snapshot");
  snapshot.setAttribute("aria-hidden", "true");
  pane.append(page, snapshot);

  const controls = element(document, "div", "peek-controls");
  controls.setAttribute("role", "toolbar");
  controls.setAttribute("aria-label", "Peek controls");
  controls.append(
    controlButton(document, "close", "Close Peek (Esc)", () => intents.dismiss("closeButton")),
    controlButton(document, "expand", "Open as tab (⌘O)", intents.expand),
  );

  dialog.append(scrim, pane, controls);
  shadow.append(dialog);
  return { host, dialog, scrim, pane, page, snapshot, controls };
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
    case "snapshot":
      return parts.snapshot;
  }
}
