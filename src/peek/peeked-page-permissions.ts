/**
 * Features the peeked page may use, as an iframe `allow` list. Both the Peek's frame and the frame
 * inside the Peek window carry it, because a frame can only delegate what it was given itself.
 */
export const PEEKED_PAGE_PERMISSIONS =
  "autoplay; clipboard-read; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
