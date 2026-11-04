export type ScrollLock = { readonly release: () => void };

/**
 * Stops the page behind a Peek from scrolling, including scroll chained out of the peeked frame
 * once it reaches its end. The scrollbar's gutter is kept so the page does not shift sideways.
 */
export function lockPageScroll(document: Document): ScrollLock {
  const root = document.documentElement;
  const view = document.defaultView;
  const hadScrollbar = view !== null && view.innerWidth > root.clientWidth;
  const previous = {
    overflow: root.style.getPropertyValue("overflow"),
    overflowPriority: root.style.getPropertyPriority("overflow"),
    gutter: root.style.getPropertyValue("scrollbar-gutter"),
    gutterPriority: root.style.getPropertyPriority("scrollbar-gutter"),
  };

  root.style.setProperty("overflow", "hidden", "important");
  if (hadScrollbar) root.style.setProperty("scrollbar-gutter", "stable", "important");

  return {
    release: () => {
      root.style.setProperty("overflow", previous.overflow, previous.overflowPriority);
      root.style.setProperty("scrollbar-gutter", previous.gutter, previous.gutterPriority);
    },
  };
}
