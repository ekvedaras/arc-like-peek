import { PEEK_LAYOUT, PEEK_SURFACE } from "../motion-tokens.ts";

/**
 * Colours follow wiki/research/arc-peek.md §5 and §13: Arc tints the scrim with the Space colour; without
 * a theme we use the neutral grey-blue measured from Arc's default look, and a GUESS for the dark scrim.
 * The shadow, the dark blank pane and the dark controls were measured from a recording of Arc
 * (wiki/research/2026-11-04-arc-recording-measurements.md).
 */
export const PEEK_OVERLAY_STYLES = `
:host {
  all: initial !important;
  display: block !important;
}

.peek-dialog {
  --peek-scrim-tint: 128 132 160;
  --peek-pane-background: #ffffff;
  --peek-pane-shadow: 0 0 10px rgb(0 0 0 / 0.3);
  --peek-control-background: rgb(253 253 255);
  --peek-control-background-hover: #ffffff;
  --peek-control-glyph: rgb(100 99 134);
  --peek-control-shadow: 0 1px 2px rgb(0 0 0 / 0.12), 0 2px 8px rgb(0 0 0 / 0.1);
  --peek-focus-ring: rgb(84 101 255);

  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  overflow: hidden;
  background: transparent;
  color-scheme: light;
  font: 13px/1.2 system-ui, -apple-system, sans-serif;
  overscroll-behavior: contain;
}

.peek-dialog::backdrop {
  background: transparent;
}

@media (prefers-color-scheme: dark) {
  .peek-dialog {
    --peek-scrim-tint: 20 20 26;
    --peek-pane-background: #000000;
    --peek-control-background: rgb(12 12 14);
    --peek-control-background-hover: rgb(36 36 40);
    --peek-control-glyph: rgb(214 214 222);
    --peek-control-shadow: 0 1px 2px rgb(0 0 0 / 0.4), 0 2px 8px rgb(0 0 0 / 0.35);
    color-scheme: dark;
  }
}

.peek-scrim {
  position: absolute;
  inset: 0;
  background: rgb(var(--peek-scrim-tint) / ${PEEK_SURFACE.scrimDim});
  backdrop-filter: ${PEEK_SURFACE.scrimBlur > 0 ? `blur(${PEEK_SURFACE.scrimBlur}px)` : "none"};
  will-change: opacity;
}

.peek-pane {
  position: absolute;
  overflow: hidden;
  border-radius: ${PEEK_SURFACE.paneCornerRadius}px;
  background: var(--peek-pane-background);
  box-shadow: var(--peek-pane-shadow);
  transform-origin: 0 0;
  will-change: transform, opacity;
}

.peek-page {
  position: absolute;
  left: 0;
  top: 0;
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--peek-pane-background);
  transform-origin: 0 0;
}

.peek-controls {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: ${PEEK_LAYOUT.controlPitch - PEEK_LAYOUT.controlDiameter}px;
  transform-origin: 50% 0;
  will-change: transform, opacity;
}

.peek-control {
  display: grid;
  place-items: center;
  width: ${PEEK_LAYOUT.controlDiameter}px;
  height: ${PEEK_LAYOUT.controlDiameter}px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--peek-control-background);
  color: var(--peek-control-glyph);
  box-shadow: var(--peek-control-shadow);
  cursor: pointer;
  transition: transform 120ms ease-out, background-color 120ms ease-out;
}

.peek-control:hover {
  background: var(--peek-control-background-hover);
  transform: scale(1.05);
}

.peek-control:active {
  transform: scale(0.95);
}

.peek-control:focus-visible {
  outline: 2px solid var(--peek-focus-ring);
  outline-offset: 2px;
}

.peek-control svg {
  width: 14px;
  height: 14px;
}
`;
