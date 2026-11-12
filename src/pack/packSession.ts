import { parseDocument } from "../editor/domain";
import type { EditorDocument } from "../editor/domain";
import { gameFilePath, parsePackDocument, resourceKey, verifyPackSources } from "./packDocument";
import type { PackDocument, PackItemAsset, PackModelAsset, PackTextureAsset, ResourceLocation } from "./packDocument";
import { updateItemDisplay } from "./itemProfile";
import type { ItemAxis, ItemDisplayContext, ItemDisplayTransform } from "./itemProfile";

/**
 * Pack-wide editing state independent of React, renderer objects and local
 * recovery. A single history records source edits and pack-index operations.
 */
export interface PackSnapshot {
  pack: PackDocument;
  sources: EditorDocument[];
}

export interface PackSession {
  present: PackSnapshot;
  past: readonly PackSnapshot[];
  future: readonly PackSnapshot[];
  revision: number;
}

export const MAX_PACK_SESSION_MODELS = 8;
const MAX_HISTORY = 50;

export class PackSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackSessionError";
  }
}

function fail(message: string): never { throw new PackSessionError(message); }

function validate(snapshot: PackSnapshot, previous?: PackSnapshot): PackSnapshot {
  const pack = parsePackDocument(snapshot.pack);
  if (pack.models.length > MAX_PACK_SESSION_MODELS)
    fail("Pack session currently supports at most eight model assets.");
  const old = new Map(previous?.sources.map(doc => [doc.id, doc]) ?? []);
  const sources = snapshot.sources.map(doc =>
    old.get(doc.id) === doc ? doc : parseDocument(doc));
  verifyPackSources(pack, sources);
  const referenced = new Set(pack.models.map(model => model.sourceDocumentId));
  if (sources.length !== referenced.size ||
      sources.some(doc => !referenced.has(doc.id)))
    fail("Pack source documents contain missing or unreferenced models.");
  return { pack, sources };
}

function commitSnapshot(session: PackSession, candidate: PackSnapshot): PackSession {
  if (candidate.pack === session.present.pack &&
      candidate.sources === session.present.sources) return session;
  const present = validate(candidate, session.present);
  return {
    present,
    past: [...session.past, session.present].slice(-MAX_HISTORY),
    future: [],
    revision: session.revision + 1
  };
}

/** Commit source and pack index together in one undo step. */
export function commitPackSnapshot(session: PackSession, snapshot: PackSnapshot): PackSession {
  return commitSnapshot(session, snapshot);
}

export function createPackSession(pack: PackDocument,
                                  sources: readonly EditorDocument[]): PackSession {
  return {
    present: validate({ pack, sources: [...sources] }),
    past: [], future: [], revision: 0
  };
}

export function activePackModel(session: PackSession): PackModelAsset {
  return session.present.pack.models.find(model =>
    model.id === session.present.pack.activeModelId) ??
    fail("The active model has no pack-index entry.");
}

export function activePackDocument(session: PackSession): EditorDocument {
  const sourceId = activePackModel(session).sourceDocumentId;
  return session.present.sources.find(doc => doc.id === sourceId) ??
    fail("The active source model is missing.");
}

/** Changes the working model without adding a content undo entry. */
export function selectPackModel(session: PackSession, modelId: string): PackSession {
  if (session.present.pack.activeModelId === modelId) return session;
  if (!session.present.pack.models.some(model => model.id === modelId))
    fail("The requested model is not in this pack.");
  return {
    ...session,
    present: {
      ...session.present,
      pack: { ...session.present.pack, activeModelId: modelId }
    },
    revision: session.revision + 1
  };
}

export function editActivePackDocument(session: PackSession,
  operation: (source: EditorDocument) => EditorDocument): PackSession {
  const current = activePackDocument(session);
  const candidate = operation(current);
  if (candidate === current) return session;
  if (candidate.id !== current.id)
    fail("An edit cannot change the active source model identity.");
  return commitSnapshot(session, {
    pack: session.present.pack,
    sources: session.present.sources.map(doc => doc.id === current.id ? candidate : doc)
  });
}

export function editPackIndex(session: PackSession,
  operation: (pack: PackDocument) => PackDocument): PackSession {
  const candidate = operation(session.present.pack);
  if (candidate === session.present.pack) return session;
  return commitSnapshot(session, {
    pack: candidate, sources: session.present.sources
  });
}

/** The new model and its texture paths must be explicit and collision-free. */
export function addPackModel(session: PackSession, source: EditorDocument,
  model: PackModelAsset, textures: readonly PackTextureAsset[]): PackSession {
  if (session.present.pack.models.some(entry => entry.id === model.id))
    fail("A model with this ID already exists.");
  if (session.present.sources.some(entry => entry.id === source.id))
    fail("This source ID already belongs to the current pack.");
  if (model.sourceDocumentId !== source.id)
    fail("The new model must point to its exact editable source ID.");
  return commitSnapshot(session, {
    pack: {
      ...session.present.pack,
      activeModelId: model.id,
      models: [...session.present.pack.models, model],
      textures: [...session.present.pack.textures, ...textures]
    },
    sources: [...session.present.sources, source]
  });
}

/** Delete one model; shared sources are kept while still referenced. */
export function removePackModel(session: PackSession, modelId: string): PackSession {
  const pack = session.present.pack;
  if (!pack.models.some(model => model.id === modelId))
    fail("Model is not in this pack.");
  if (pack.models.length === 1)
    fail("The last editable model cannot be removed from the pack.");
  const models = pack.models.filter(model => model.id !== modelId);
  const sourceIds = new Set(models.map(model => model.sourceDocumentId));
  const textureIds = new Set(models.flatMap(model =>
    model.textures.map(binding => binding.textureAssetId)));
  const activeModelId = pack.activeModelId === modelId ?
    models[0]!.id : pack.activeModelId;
  return commitSnapshot(session, {
    pack: {
      ...pack, models, activeModelId,
      textures: pack.textures.filter(texture => textureIds.has(texture.id)),
      ...(pack.items ? { items: pack.items.filter(item => item.sourceModelId !== modelId) } : {})
    },
    sources: session.present.sources.filter(doc => sourceIds.has(doc.id))
  });
}

/** Rename paths without renaming the internal IDs or damaging source data. */
export function setModelResource(session: PackSession, modelId: string,
  resource: ResourceLocation, replaces: ResourceLocation): PackSession {
  const model = session.present.pack.models.find(entry => entry.id === modelId) ??
    fail("The resource belongs to a missing model.");
  const newPath = gameFilePath("models", resource);
  const newReplacement = gameFilePath("blockstates", replaces);
  if (newPath === gameFilePath("models", model.resource) &&
      newReplacement === gameFilePath("blockstates", model.replaces)) return session;
  return editPackIndex(session, pack => ({
    ...pack,
    models: pack.models.map(entry => entry.id === modelId ?
      { ...entry, resource, replaces } : entry)
  }));
}

export function setTextureResource(session: PackSession, textureAssetId: string,
  resource: ResourceLocation): PackSession {
  const texture = session.present.pack.textures.find(entry => entry.id === textureAssetId) ??
    fail("The resource belongs to a missing texture.");
  if (resourceKey(texture.resource) === resourceKey(resource)) return session;
  return editPackIndex(session, pack => ({
    ...pack,
    textures: pack.textures.map(entry => entry.id === textureAssetId ?
      { ...entry, resource } : entry)
  }));
}

/** Item creation and edits join the same source/pack content history. */
export function addPackItem(session: PackSession, item: PackItemAsset): PackSession {
  if (session.present.pack.items?.some(existing => existing.id === item.id))
    fail("The item asset ID already exists.");
  return editPackIndex(session, pack => ({
    ...pack, items: [...(pack.items ?? []), item]
  }));
}

export function removePackItem(session: PackSession, itemId: string): PackSession {
  if (!session.present.pack.items?.some(item => item.id === itemId))
    fail("The item asset no longer exists.");
  return editPackIndex(session, pack => ({
    ...pack, items: pack.items!.filter(item => item.id !== itemId)
  }));
}

export function setPackItemResource(session: PackSession, itemId: string,
  model: ResourceLocation, replaces: ResourceLocation): PackSession {
  const item = session.present.pack.items?.find(entry => entry.id === itemId) ??
    fail("The item asset no longer exists.");
  if (resourceKey(item.resource) === resourceKey(model) &&
      resourceKey(item.replaces) === resourceKey(replaces)) return session;
  return editPackIndex(session, pack => ({
    ...pack, items: pack.items!.map(entry => entry.id === itemId ?
      { ...entry, resource: model, replaces } : entry)
  }));
}

export function setPackItemDisplay(session: PackSession, itemId: string,
  context: ItemDisplayContext, field: keyof ItemDisplayTransform,
  axis: ItemAxis, value: number): PackSession {
  const item = session.present.pack.items?.find(entry => entry.id === itemId) ??
    fail("The item asset no longer exists.");
  const display = updateItemDisplay(item.display, context, field, axis, value);
  if (display === item.display) return session;
  return editPackIndex(session, pack => ({
    ...pack, items: pack.items!.map(entry => entry.id === itemId ?
      { ...entry, display } : entry)
  }));
}

export function setItemHandAnimation(session: PackSession, itemId: string,
  enabled: boolean): PackSession {
  const item = session.present.pack.items?.find(entry => entry.id === itemId) ??
    fail("The item asset no longer exists.");
  if (item.handAnimationOnSwap === enabled) return session;
  return editPackIndex(session, pack => ({
    ...pack, items: pack.items!.map(entry => entry.id === itemId ?
      { ...entry, handAnimationOnSwap: enabled } : entry)
  }));
}

function restore(session: PackSession, previous: PackSnapshot): PackSnapshot {
  const active = session.present.pack.activeModelId;
  return previous.pack.models.some(model => model.id === active) ? {
    ...previous, pack: { ...previous.pack, activeModelId: active }
  } : previous;
}

export function undoPackSession(session: PackSession): PackSession {
  if (!session.past.length) return session;
  const old = session.past[session.past.length - 1]!;
  return {
    present: restore(session, old),
    past: session.past.slice(0, -1),
    future: [session.present, ...session.future],
    revision: session.revision + 1
  };
}

export function redoPackSession(session: PackSession): PackSession {
  if (!session.future.length) return session;
  return {
    present: restore(session, session.future[0]!),
    past: [...session.past, session.present].slice(-MAX_HISTORY),
    future: session.future.slice(1),
    revision: session.revision + 1
  };
}
