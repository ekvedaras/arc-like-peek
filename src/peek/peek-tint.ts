export type Rgb = { readonly red: number; readonly green: number; readonly blue: number };

export type ColourScheme = "light" | "dark";

/** CSS colour values for the parts of the overlay that take the page's colour. */
export type PeekTint = {
  /** `r g b` channels, for `rgb(<tint> / alpha)`. */
  readonly scrim: string;
  readonly controlBackground: string;
  readonly controlBackgroundHover: string;
  readonly controlGlyph: string;
};

/** Below this saturation a page colour is a grey with no hue worth tinting with. */
const MIN_TINTABLE_SATURATION = 0.12;

type Hsl = { readonly hue: number; readonly saturation: number; readonly lightness: number };

/**
 * Arc tints the scrim and the controls with the Space's colour. A page has a theme colour or a
 * background instead; a neutral page (white, grey, black) leaves the overlay's neutral look as it is.
 *
 * MEASURED (dark, green Space): button `rgb(1,14,1)` = hsl(120, 87 %, 3 %), glyph `rgb(198,249,205)` =
 * hsl(126, 80 %, 87 %). The scrim and the whole light scheme are not measured: they keep the lightness
 * of the neutral look this replaces.
 */
export function peekTint(source: Rgb | null, scheme: ColourScheme): PeekTint | null {
  if (!source) return null;
  const { hue, saturation } = toHsl(source);
  if (saturation < MIN_TINTABLE_SATURATION) return null;

  const colour = (saturationRange: readonly [number, number], lightness: number): Rgb =>
    fromHsl({ hue, saturation: clamp(saturation, ...saturationRange), lightness });
  const channels = ({ red, green, blue }: Rgb): string => `${red} ${green} ${blue}`;
  const css = ({ red, green, blue }: Rgb): string => `rgb(${red} ${green} ${blue})`;

  if (scheme === "dark") {
    return {
      scrim: channels(colour([0.25, 0.6], 0.09)),
      controlBackground: css(colour([0.3, 0.87], 0.03)),
      controlBackgroundHover: css(colour([0.3, 0.87], 0.12)),
      controlGlyph: css(colour([0.3, 0.8], 0.87)),
    };
  }
  return {
    scrim: channels(colour([0.12, 0.3], 0.57)),
    controlBackground: css(colour([0.3, 0.3], 0.99)),
    controlBackgroundHover: css(fromHsl({ hue, saturation: 0, lightness: 1 })),
    controlGlyph: css(colour([0.15, 0.3], 0.45)),
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function toHsl({ red, green, blue }: Rgb): Hsl {
  const [r, g, b] = [red / 255, green / 255, blue / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const chroma = max - min;
  if (chroma === 0) return { hue: 0, saturation: 0, lightness };
  const saturation = chroma / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === r) hue = ((g - b) / chroma + 6) % 6;
  else if (max === g) hue = (b - r) / chroma + 2;
  else hue = (r - g) / chroma + 4;
  return { hue: hue * 60, saturation, lightness };
}

function fromHsl({ hue, saturation, lightness }: Hsl): Rgb {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = hue / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const sectors: readonly (readonly [number, number, number])[] = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ];
  const [r, g, b] = sectors[Math.floor(sector) % 6] ?? [0, 0, 0];
  const offset = lightness - chroma / 2;
  const channel = (value: number): number => Math.round((value + offset) * 255);
  return { red: channel(r), green: channel(g), blue: channel(b) };
}
