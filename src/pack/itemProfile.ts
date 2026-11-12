/**
 * Narrow Java Edition 1.21.4 item model profile. An item definition routes
 * to one raw model; display transforms are saved in that model's "display".
 * This is visual replacement only, not item components or game behavior.
 */
export const JAVA_1214_ITEM_TARGETS = [
  "stick", "paper", "apple", "diamond_sword"
] as const;

export const ITEM_DISPLAY_CONTEXTS = [
  "gui", "ground", "fixed", "firstperson_righthand", "thirdperson_righthand"
] as const;
export type ItemDisplayContext = typeof ITEM_DISPLAY_CONTEXTS[number];
export type ItemAxis = 0 | 1 | 2;

export interface ItemDisplayTransform {
  rotation: [number, number, number];
  translation: [number, number, number];
  scale: [number, number, number];
}
export type ItemDisplay = Record<ItemDisplayContext, ItemDisplayTransform>;

const BASE_DISPLAY: ItemDisplay = {
  gui: {
    rotation: [30, -135, 0], translation: [0, 0, 0],
    scale: [0.625, 0.625, 0.625]
  },
  ground: {
    rotation: [0, 0, 0], translation: [0, 2, 0],
    scale: [0.25, 0.25, 0.25]
  },
  fixed: {
    rotation: [0, 180, 0], translation: [0, 0, 0],
    scale: [0.5, 0.5, 0.5]
  },
  firstperson_righthand: {
    rotation: [0, -90, 25], translation: [1.13, 3.2, 1.13],
    scale: [0.68, 0.68, 0.68]
  },
  thirdperson_righthand: {
    rotation: [75, 45, 0], translation: [0, 2.5, 0],
    scale: [0.375, 0.375, 0.375]
  }
};

export const itemContextName = (context: ItemDisplayContext): string => ({
  gui: "Inventory / GUI", ground: "Dropped item", fixed: "Item frame",
  firstperson_righthand: "First-person hand",
  thirdperson_righthand: "Third-person hand"
})[context];

export function defaultItemDisplay(): ItemDisplay {
  return Object.fromEntries(ITEM_DISPLAY_CONTEXTS.map(context => {
    const transform = BASE_DISPLAY[context];
    return [context, {
      rotation: [...transform.rotation], translation: [...transform.translation],
      scale: [...transform.scale]
    }];
  })) as ItemDisplay;
}

export class ItemProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ItemProfileError";
  }
}

const object = (value: unknown, keys: readonly string[], name: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !keys.includes(key)) ||
      keys.some(key => !Object.hasOwn(value, key)))
    throw new ItemProfileError(name + " has missing or unsupported display fields.");
  return value as Record<string, unknown>;
};

function vector(value: unknown, name: string, low: number, high: number): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3 ||
      value.some(v => typeof v !== "number" || !Number.isFinite(v) ||
        v < low || v > high))
    throw new ItemProfileError(name + " requires three finite values between " + low + " and " + high + ".");
  return [value[0], value[1], value[2]];
}

export function parseItemDisplay(value: unknown): ItemDisplay {
  const raw = object(value, ITEM_DISPLAY_CONTEXTS, "Item display");
  return Object.fromEntries(ITEM_DISPLAY_CONTEXTS.map(context => {
    const transform = object(raw[context], ["rotation", "translation", "scale"], context);
    return [context, {
      rotation: vector(transform.rotation, context + " rotation", -360, 360),
      translation: vector(transform.translation, context + " translation", -16, 16),
      scale: vector(transform.scale, context + " scale", 0.01, 4)
    }];
  })) as ItemDisplay;
}

/** Pure, atomically validated transform edit for the pack's single undo history. */
export function updateItemDisplay(display: ItemDisplay, context: ItemDisplayContext,
                                  field: keyof ItemDisplayTransform, axis: ItemAxis,
                                  value: number): ItemDisplay {
  if (!ITEM_DISPLAY_CONTEXTS.includes(context) ||
      !["rotation", "translation", "scale"].includes(field) ||
      ![0, 1, 2].includes(axis))
    throw new ItemProfileError("Unsupported item display edit.");
  if (display[context][field][axis] === value) return display;
  return parseItemDisplay({
    ...display, [context]: {
      ...display[context],
      [field]: display[context][field].map((part, index) => index === axis ? value : part)
    }
  });
}

/** Export the JSON model display section without changing the editor source. */
export function javaItemDisplay(display: ItemDisplay): ItemDisplay {
  return parseItemDisplay(display);
}
