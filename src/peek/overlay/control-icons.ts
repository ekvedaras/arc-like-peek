const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** Path data drawn on a 14×14 grid, after SF Symbols `xmark` and `arrow.up.left.and.arrow.down.right`. */
const ICON_PATHS = {
  close: ["M3 3 L11 11", "M11 3 L3 11"],
  expand: ["M2.5 6.5 V2.5 H6.5", "M2.5 2.5 L6 6", "M11.5 7.5 V11.5 H7.5", "M11.5 11.5 L8 8"],
} as const;

export type ControlIcon = keyof typeof ICON_PATHS;

/** Built with DOM calls rather than markup so pages enforcing Trusted Types can't block it. */
export function createControlIcon(document: Document, icon: ControlIcon): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 14 14");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const pathData of ICON_PATHS[icon]) {
    const path = document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", pathData);
    svg.append(path);
  }
  return svg;
}
