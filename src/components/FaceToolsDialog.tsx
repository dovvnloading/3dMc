import type { EditorDocument, FaceDirection } from "../editor/domain";
import { makeFaceTextureUnique, overlappingFaces, reverseFaceUV } from "../editor/regions";
import { CreatorDialog } from "./CreatorDialog";

export function FaceToolsDialog({ document, nodeId, face, onApply, onClose }: {
  document: EditorDocument; nodeId: string; face: FaceDirection;
  onApply: (operation: (document: EditorDocument) => EditorDocument) => boolean; onClose: () => void;
}) {
  const node = document.cuboids.find(item => item.id === nodeId);
  const references = overlappingFaces(document, nodeId, face);
  const disabled = !node || node.locked || !node.visible || node.material !== "texture";
  return <CreatorDialog title="Face texture tools" kicker="UV BINDINGS · SHARED PIXEL IMPACT" onClose={onClose}>
    <p className="creator-description"><strong>{node?.name ?? "Missing part"} · {face}</strong><br/>
      Reverse U or V changes the authored texture-axis bounds, retaining the face rotation. It does not rotate or mirror the model geometry.</p>
    <div className="creator-button-grid"><button type="button" disabled={disabled} onClick={() => {
      if (onApply(current => reverseFaceUV(current, nodeId, face, "u"))) onClose();
    }}>Reverse U bounds</button><button type="button" disabled={disabled} onClick={() => {
      if (onApply(current => reverseFaceUV(current, nodeId, face, "v"))) onClose();
    }}>Reverse V bounds</button></div>
    <h3>{references.length} other face bindings overlap this region</h3>
    <p className="creator-help">Overlaps include hidden and locked geometry: those faces still reference the same texture source. A shared edge alone is not counted as an overlapping area.</p>
    <div className="creator-impact-list" aria-label="Faces sharing UV pixels">
      {references.slice(0, 30).map(reference => <span key={reference.nodeId + reference.face}>{reference.name} · {reference.face}</span>)}
      {references.length > 30 && <span>And {references.length - 30} more…</span>}
      {!references.length && <span>No other face has a positive-area overlap.</span>}
    </div>
    <h3>Make this face independent</h3>
    <p className="creator-description">Copy its entire texture sheet into one new slot and rebind only this face. UV bounds, rotation and RGBA values remain unchanged. This is one undoable edit, not automatic atlas packing.</p>
    <p className="creator-help">Texture slots: {document.textures.length}/16. The new copy is retained in native saves and recovery.</p>
    {disabled && <p className="creator-error">Choose a visible, unlocked painted part to use these operations.</p>}
    <div className="creator-dialog-actions"><button type="button" onClick={onClose}>Close</button>
      <button type="button" className="creator-primary" disabled={disabled || document.textures.length >= 16} onClick={() => {
        const id = "face_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
        if (onApply(current => makeFaceTextureUnique(current, nodeId, face, id))) onClose();
      }}>Copy sheet and rebind this face</button></div>
  </CreatorDialog>;
}
