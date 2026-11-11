import type { History } from "../editor/history";
import type { EditorDocument } from "../editor/domain";
import { parseDocument } from "../editor/domain";
import { indexLegacyProject, verifyPackSources, gameFilePath } from "./packDocument";
import { activePackDocument, activePackModel, commitPackSnapshot,
  createPackSession, editActivePackDocument } from "./packSession";
import type { PackSession, PackSnapshot } from "./packSession";

/** Preserve old single-model undo snapshots when entering pack mode. */
export function upgradeEditorHistory(history: History): PackSession {
  const session = createPackSession(indexLegacyProject(history.present), [history.present]);
  const snapshot = (doc: EditorDocument): PackSnapshot => ({
    pack: indexLegacyProject(doc), sources: [parseDocument(doc)]
  });
  return { ...session, past: history.past.map(snapshot),
    future: history.future.map(snapshot), revision: history.revision };
}

/** Editor UI adapter; pack history remains the only authoritative source. */
export function packHistoryView(session: PackSession): History {
  const present = activePackDocument(session);
  const matching = (snapshot: PackSnapshot) =>
    snapshot.sources.find(source => source.id === present.id) ?? present;
  return { present, past: session.past.map(matching), future: session.future.map(matching),
    revision: session.revision };
}

function updatePackSourceView(session: PackSession, source: EditorDocument): PackSession {
  const current = activePackDocument(session);
  if (source === current) return session;
  if (current.id !== source.id) throw new Error("Active source changed during selection.");
  const parsed = parseDocument(source);
  if (parsed.textures.length !== current.textures.length ||
      parsed.textures.some((t, i) => t.id !== current.textures[i]?.id))
    throw new Error("Texture assets must be changed as a pack edit.");
  const sources = session.present.sources.map(doc => doc.id === source.id ? parsed : doc);
  verifyPackSources(session.present.pack, sources);
  return { ...session, present: { ...session.present, sources } };
}

/** Source texture additions/deletions update all affected pack references atomically. */
function editWithTextureAssets(session: PackSession, before: EditorDocument, after: EditorDocument): PackSession {
  const beforeIds = new Set(before.textures.map(t => t.id));
  const afterIds = new Set(after.textures.map(t => t.id));
  const added = after.textures.filter(t => !beforeIds.has(t.id));
  const removed = before.textures.filter(t => !afterIds.has(t.id));
  if (!added.length && !removed.length) return editActivePackDocument(session, () => after);
  const pack = session.present.pack;
  const active = activePackModel(session);
  const ids = new Set(pack.textures.map(t => t.id));
  const paths = new Set(pack.textures.map(t => gameFilePath("textures", t.resource)));
  const additions = added.map(texture => {
    let id = "asset_" + texture.id, suffix = 1;
    while (ids.has(id)) id = "asset_" + texture.id.slice(0, 80) + "_" + suffix++;
    ids.add(id);
    let path = active.resource.path.slice(0, 80) + "/sheet_" + texture.id.slice(0, 24);
    let n = 1;
    while (paths.has(gameFilePath("textures", { namespace: active.resource.namespace, path })))
      path = active.resource.path.slice(0, 80) + "/sheet_" + texture.id.slice(0, 20) + "_" + n++;
    const resource = { namespace: active.resource.namespace, path };
    paths.add(gameFilePath("textures", resource));
    return { id, sourceDocumentId: before.id, sourceTextureId: texture.id, resource };
  });
  const removedAssets = new Set(pack.textures.filter(asset =>
    asset.sourceDocumentId === before.id && removed.some(t => t.id === asset.sourceTextureId))
    .map(asset => asset.id));
  const models = pack.models.map(model => model.sourceDocumentId !== before.id ? model : ({
    ...model,
    textures: [
      ...model.textures.filter(binding => !removed.some(t => t.id === binding.sourceTextureId)),
      ...additions.map(asset => ({ sourceTextureId: asset.sourceTextureId, textureAssetId: asset.id }))
    ]
  }));
  return commitPackSnapshot(session, {
    pack: { ...pack, models,
      textures: [...pack.textures.filter(asset => !removedAssets.has(asset.id)), ...additions] },
    sources: session.present.sources.map(doc => doc.id === before.id ? after : doc)
  });
}

/** Adapt existing gestures/commands to pack-wide history without duplicate stacks. */
export function advancePackFromEditor(session: PackSession, before: History, after: History): PackSession {
  if (after === before || after.present === before.present) return session;
  if (after.past !== before.past)
    return editWithTextureAssets(session, before.present, after.present);
  return updatePackSourceView(session, after.present);
}
