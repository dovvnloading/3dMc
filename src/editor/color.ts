/** Small, renderer-independent colour utilities. UI and documents use canonical #rrggbb. */
export interface RGB { readonly r: number; readonly g: number; readonly b: number }
export interface HSV { readonly h: number; readonly s: number; readonly v: number }

export function parseHex(input: string): RGB | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!match) return null;
  const digits = match[1]!;
  const full = digits.length === 3
    ? Array.from(digits, part => part + part).join("") : digits;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16)
  };
}

/** Never silently clamp a typed RGB value: reject fractional/out-of-range values. */
export function parseRgbChannel(input: string): number | null {
  const text = input.trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const value = Number(text);
  return value <= 255 ? value : null;
}

export function rgbToHex({ r, g, b }: RGB): string | null {
  const channels = [r, g, b];
  if (!channels.every(value => Number.isInteger(value) && value >= 0 && value <= 255))
    return null;
  return "#" + channels.map(value => value.toString(16).padStart(2, "0")).join("");
}

export function normalizeHex(input: string): string | null {
  const rgb = parseHex(input);
  return rgb ? rgbToHex(rgb) : null;
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const red = r / 255, green = g / 255, blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === red) h = ((green - blue) / delta) % 6;
    else if (max === green) h = (blue - red) / delta + 2;
    else h = (red - green) / delta + 4;
    h = ((h * 60) + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

const clamp01 = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const hue = Number.isFinite(h) ? ((h % 360) + 360) % 360 : 0;
  const saturation = clamp01(s), brightness = clamp01(v);
  const chroma = brightness * saturation;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const offset = brightness - chroma;
  const sector = Math.floor(hue / 60);
  const values: readonly (readonly number[])[] = [
    [chroma, x, 0], [x, chroma, 0], [0, chroma, x],
    [0, x, chroma], [x, 0, chroma], [chroma, 0, x]
  ];
  const [red = 0, green = 0, blue = 0] = values[sector]!;
  return {
    r: Math.round((red + offset) * 255),
    g: Math.round((green + offset) * 255),
    b: Math.round((blue + offset) * 255)
  };
}

export function hsvToHex(hsv: HSV): string {
  return rgbToHex(hsvToRgb(hsv))!;
}

export function hexToHsv(hex: string): HSV | null {
  const rgb = parseHex(hex);
  return rgb ? rgbToHsv(rgb) : null;
}
