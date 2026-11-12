import type { EditorDocument, PixelTexture, RasterLayer } from "./domain";

export const MAX_RASTER_LAYERS = 8;
export class RasterLayerError extends Error {
  constructor(message: string) { super(message); this.name = "RasterLayerError"; }
}
function fail(message: string): never { throw new RasterLayerError(message); }
const identifier = (id: string) => /^[a-zA-Z0-9_-]{1,100}$/.test(id);
const validPixels = (pixels: unknown, w: number, h: number): pixels is number[] =>
  Array.isArray(pixels) && pixels.length === w * h * 4 &&
  pixels.every(v => Number.isSafeInteger(v) && v >= 0 && v <= 255);

/** Deterministic straight-alpha normal blending, bottom layer first. */
export function flattenRasterLayers(layers: readonly RasterLayer[], width: number, height: number): number[] {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width > 64 || height > 64)
    fail("Invalid raster dimensions.");
  const out = new Array<number>(width * height * 4).fill(0);
  for (let i = 0; i < width * height; i++) {
    const j = i * 4;
    let a = 0, r = 0, g = 0, b = 0;
    let transparent: readonly number[] | null = null;
    for (const layer of layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      const p = layer.pixels;
      const sa = p[j + 3]! * layer.opacity / 255;
      if (sa === 0) {
        if (!transparent) transparent = p.slice(j, j + 3);
        continue;
      }
      r = p[j]! * sa + r * (1 - sa);
      g = p[j + 1]! * sa + g * (1 - sa);
      b = p[j + 2]! * sa + b * (1 - sa);
      a = sa + a * (1 - sa);
    }
    if (a > 0) {
      out[j] = Math.round(r / a); out[j + 1] = Math.round(g / a);
      out[j + 2] = Math.round(b / a);
    } else if (transparent) {
      out[j] = transparent[0]!; out[j + 1] = transparent[1]!; out[j + 2] = transparent[2]!;
    }
    out[j + 3] = Math.round(a * 255);
  }
  return out;
}

/** Layer structure AND derived export pixels are strictly validated at import. */
export function validRasterLayers(texture: PixelTexture): boolean {
  if (!texture.layers) return texture.activeLayerId === undefined;
  const { layers, activeLayerId, width, height, pixels } = texture;
  if (!Array.isArray(layers) || !layers.length || layers.length > MAX_RASTER_LAYERS ||
      typeof activeLayerId !== "string" ||
      new Set(layers.map(x => x?.id)).size !== layers.length ||
      !layers.some(layer => layer?.id === activeLayerId)) return false;
  for (const layer of layers) {
    if (!layer || typeof layer !== "object" || Array.isArray(layer) ||
        Object.keys(layer).some(key => !["id","name","visible","opacity","pixels"].includes(key)) ||
        typeof layer.id !== "string" || !identifier(layer.id) ||
        typeof layer.name !== "string" || !layer.name.trim() || layer.name.length > 100 ||
        typeof layer.visible !== "boolean" ||
        typeof layer.opacity !== "number" || !Number.isFinite(layer.opacity) ||
        layer.opacity < 0 || layer.opacity > 1 || !validPixels(layer.pixels, width, height))
      return false;
  }
  return flattenRasterLayers(layers, width, height)
    .every((value, index) => value === pixels[index]);
}

const editTexture = (doc: EditorDocument, textureId: string,
  update: (texture: PixelTexture) => PixelTexture): EditorDocument => {
  const texture = doc.textures.find(t => t.id === textureId);
  if (!texture) fail("The layer texture no longer exists.");
  const next = update(texture);
  return next === texture ? doc : { ...doc,
    textures: doc.textures.map(t => t.id === textureId ? next : t) };
};
const publish = (t: PixelTexture, layers: RasterLayer[], activeLayerId = t.activeLayerId): PixelTexture =>
  ({ ...t, layers, activeLayerId, pixels: flattenRasterLayers(layers, t.width, t.height) });
const requireLayer = (t: PixelTexture, id: string): RasterLayer => {
  const layer = t.layers?.find(l => l.id === id);
  if (!layer) fail("The selected raster layer no longer exists.");
  return layer;
};

export function addRasterLayer(doc: EditorDocument, textureId: string,
                               layerId: string, baseId: string): EditorDocument {
  if (!identifier(layerId) || !identifier(baseId) || baseId === layerId)
    fail("Invalid or duplicated raster layer identifiers.");
  return editTexture(doc, textureId, t => {
    if (t.layers && t.layers.length >= MAX_RASTER_LAYERS) fail("At most eight raster layers per texture.");
    const layers = t.layers ? [...t.layers] : [{
      id: baseId, name: "Background", visible: true, opacity: 1, pixels: [...t.pixels]
    }];
    if (layers.some(layer => layer.id === layerId || layer.id === baseId && !!t.layers))
      fail("Raster layer ID already exists.");
    const selected = t.layers?.findIndex(l => l.id === t.activeLayerId) ?? layers.length - 1;
    layers.splice(selected + 1, 0, { id: layerId, name: "Layer " + (layers.length + 1),
      visible: true, opacity: 1, pixels: new Array<number>(t.width * t.height * 4).fill(0) });
    return publish(t, layers, layerId);
  });
}
export function selectRasterLayer(doc: EditorDocument, textureId: string, id: string): EditorDocument {
  return editTexture(doc, textureId, t => {
    requireLayer(t, id);
    return t.activeLayerId === id ? t : { ...t, activeLayerId: id };
  });
}
export function renameRasterLayer(doc: EditorDocument, textureId: string,
                                  id: string, name: string): EditorDocument {
  const next = name.trim();
  if (!next || next.length > 100) fail("Raster layer names must contain 1–100 characters.");
  return editTexture(doc, textureId, t => {
    const layer = requireLayer(t, id);
    return layer.name === next ? t : publish(t, t.layers!.map(l =>
      l.id === id ? { ...l, name: next } : l));
  });
}
export function setRasterLayerVisibility(doc: EditorDocument, textureId: string,
                                         id: string, visible: boolean): EditorDocument {
  return editTexture(doc, textureId, t => {
    const layer = requireLayer(t, id);
    return layer.visible === visible ? t : publish(t, t.layers!.map(l =>
      l.id === id ? { ...l, visible } : l));
  });
}
export function setRasterLayerOpacity(doc: EditorDocument, textureId: string,
                                      id: string, opacity: number): EditorDocument {
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
    fail("Opacity must be between zero and one.");
  return editTexture(doc, textureId, t => {
    const layer = requireLayer(t, id);
    return layer.opacity === opacity ? t : publish(t, t.layers!.map(l =>
      l.id === id ? { ...l, opacity } : l));
  });
}
export function moveRasterLayer(doc: EditorDocument, textureId: string,
                                id: string, direction: "up" | "down"): EditorDocument {
  return editTexture(doc, textureId, t => {
    requireLayer(t, id);
    const layers = [...t.layers!], index = layers.findIndex(l => l.id === id);
    const to = index + (direction === "up" ? 1 : -1);
    if (to < 0 || to >= layers.length) return t;
    [layers[index], layers[to]] = [layers[to]!, layers[index]!];
    return publish(t, layers);
  });
}
export function removeRasterLayer(doc: EditorDocument, textureId: string, id: string): EditorDocument {
  return editTexture(doc, textureId, t => {
    requireLayer(t, id);
    const layers = t.layers!.filter(l => l.id !== id);
    if (!layers.length) fail("Flatten instead of deleting the last layer.");
    const activeLayerId = t.activeLayerId === id ?
      layers[Math.min(t.layers!.findIndex(l => l.id === id), layers.length - 1)]!.id : t.activeLayerId;
    return publish(t, layers, activeLayerId);
  });
}
export function flattenTextureLayers(doc: EditorDocument, textureId: string): EditorDocument {
  return editTexture(doc, textureId, t => {
    if (!t.layers) return t;
    const { layers: _layers, activeLayerId: _active, ...flattened } = t;
    return flattened;
  });
}
export function setRasterLayerPixels(doc: EditorDocument, textureId: string,
                                     id: string, pixels: number[]): EditorDocument {
  return editTexture(doc, textureId, t => {
    const layer = requireLayer(t, id);
    if (!validPixels(pixels, t.width, t.height)) fail("Invalid raster layer RGBA pixels.");
    if (pixels.every((v,i) => v === layer.pixels[i])) return t;
    return publish(t, t.layers!.map(l => l.id === id ? { ...l, pixels: [...pixels] } : l));
  });
}
export const activeRasterLayer = (t: PixelTexture): RasterLayer | null =>
  t.layers?.find(l => l.id === t.activeLayerId) ?? null;
export function previewRasterLayer(t: PixelTexture, id: string, pixels: readonly number[]): number[] {
  requireLayer(t, id);
  if (!validPixels(pixels, t.width, t.height)) fail("Invalid preview layer pixels.");
  return flattenRasterLayers(t.layers!.map(l => l.id === id ?
    { ...l, pixels: [...pixels] } : l), t.width, t.height);
}
