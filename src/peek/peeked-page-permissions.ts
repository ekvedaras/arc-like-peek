/**
 * Features the peeked page may use, as an iframe `allow` list. Both the Peek's frame and the frame
 * inside the Peek window carry it, because a frame can only delegate what it was given itself.
 */
export const PEEKED_PAGE_PERMISSIONS =
  "autoplay; clipboard-read; clipboard-write; encrypted-media; fullscreen; picture-in-picture";

/**
 * Sandboxing keeps the peeked page's frame-busting scripts from navigating the page behind it,
 * while every other capability a normal page needs stays available.
 */
export const PEEKED_PAGE_SANDBOX = [
  "allow-downloads",
  "allow-forms",
  "allow-modals",
  "allow-orientation-lock",
  "allow-pointer-lock",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-presentation",
  "allow-same-origin",
  "allow-scripts",
  "allow-storage-access-by-user-activation",
].join(" ");
