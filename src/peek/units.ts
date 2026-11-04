export type DurationMs = number & { readonly unit: "ms" };

export function ms(value: number): DurationMs {
  if (!(Number.isFinite(value) && value >= 0)) throw new RangeError(`Invalid duration: ${value}ms`);
  // Safe: the only way to obtain a DurationMs is through this range check.
  return value as DurationMs;
}

export type PixelLength = number & { readonly unit: "px" };

export function px(value: number): PixelLength {
  if (!Number.isFinite(value)) throw new RangeError(`Invalid length: ${value}px`);
  // Safe: the only way to obtain a PixelLength is through this finiteness check.
  return value as PixelLength;
}

/** A fraction in [0, 1], e.g. a share of the viewport or an opacity. */
export type Ratio = number & { readonly unit: "ratio" };

export function ratio(value: number): Ratio {
  if (!(value >= 0 && value <= 1)) throw new RangeError(`Invalid ratio: ${value}`);
  // Safe: the only way to obtain a Ratio is through this range check.
  return value as Ratio;
}
