import type { PeekLink } from "../links.ts";
import { PEEK_SNAPSHOT } from "../motion-tokens.ts";

const ROW_SELECTOR =
  'li, tr, dt, dd, [role="row"], [role="listitem"], [role="option"], h1, h2, h3, h4, h5, h6';
const OPAQUE_ELEMENTS = new Set([
  "IFRAME",
  "VIDEO",
  "CANVAS",
  "OBJECT",
  "EMBED",
  "SCRIPT",
  "STYLE",
]);

/** A picture of the clicked link's row, as Arc crossfades with: a copy that carries its own styles. */
export type RowSnapshot = {
  readonly element: HTMLElement;
  /** The row on the page, where the picture was taken. */
  readonly rect: DOMRect;
};

/** The row is the link's list item, table row or heading, if it is small; otherwise just the link. */
export function rowOf(link: PeekLink): Element {
  const row = link.closest(ROW_SELECTOR);
  if (!row) return link;
  const { height } = row.getBoundingClientRect();
  return height > 0 && height <= PEEK_SNAPSHOT.rowMaxHeight ? row : link;
}

export function snapshotRow(link: PeekLink): RowSnapshot | null {
  const row = rowOf(link);
  const rect = row.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return null;
  const copyTarget = row.querySelectorAll("*").length < PEEK_SNAPSHOT.rowMaxElements ? row : link;
  return { element: pictureOf(copyTarget), rect: copyTarget.getBoundingClientRect() };
}

function pictureOf(original: Element): HTMLElement {
  const copy = original.cloneNode(true);
  if (!(copy instanceof HTMLElement)) throw new Error("Only HTML rows are copied");
  const originals = [original, ...original.querySelectorAll("*")];
  const copies = [copy, ...copy.querySelectorAll("*")];
  originals.forEach((each, index) => {
    const twin = copies[index];
    if (!(twin instanceof HTMLElement || twin instanceof SVGElement)) return;
    twin.removeAttribute("id");
    twin.removeAttribute("href");
    const style = getComputedStyle(each);
    twin.style.cssText = Array.from(
      style,
      (name) => `${name}:${style.getPropertyValue(name)}`,
    ).join(";");
    if (OPAQUE_ELEMENTS.has(each.tagName)) twin.replaceChildren();
  });
  const rect = original.getBoundingClientRect();
  Object.assign(copy.style, {
    position: "absolute",
    left: "0",
    top: "0",
    margin: "0",
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    boxSizing: "border-box",
    pointerEvents: "none",
  });
  return copy;
}
