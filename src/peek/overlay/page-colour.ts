import type { Rgb } from "../peek-tint.ts";

/**
 * The colour a page presents itself in: its `theme-color` (the one whose media query applies), else
 * the background of `<body>` or `<html>`. Null when the page has none that is opaque.
 */
export function pageColour(
  document: Document,
  parseCss: (colour: string) => Rgb | null,
): Rgb | null {
  const view = document.defaultView;
  const themeColours = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
  const applicable = themeColours.find(
    (meta) => !meta.media || view?.matchMedia(meta.media).matches,
  );
  const candidates = [
    applicable?.content,
    document.body ? view?.getComputedStyle(document.body).backgroundColor : undefined,
    view?.getComputedStyle(document.documentElement).backgroundColor,
  ];
  for (const candidate of candidates) {
    const parsed = candidate ? parseCss(candidate) : null;
    if (parsed) return parsed;
  }
  return null;
}

/** Resolves any CSS colour the browser understands through computed style; null if transparent or not sRGB. */
export function cssColourParser(probe: HTMLElement): (colour: string) => Rgb | null {
  return (colour) => {
    probe.style.color = "";
    probe.style.color = colour;
    if (!probe.style.color) return null;
    const match = getComputedStyle(probe).color.match(/^rgba?\(([^)]+)\)$/);
    const [red, green, blue, alpha = 1] = (match?.[1] ?? "").split(/[\s,/]+/).map(Number);
    if (red === undefined || green === undefined || blue === undefined) return null;
    if ([red, green, blue, alpha].some(Number.isNaN) || alpha < 1) return null;
    return { red, green, blue };
  };
}
