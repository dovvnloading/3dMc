import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useThree } from "@react-three/fiber";
import { TransformControls } from "@react-three/drei";
import type { Group } from "three";
import { Box3, Vector3 } from "three";
import type { EditorDocument, Vec3 } from "../editor/domain";
import { beginSelectionGesture, selectionBounds } from "../editor/selection";
import type { SelectionGesture } from "../editor/selection";

const unitBox = new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5));

interface Props {
  document: EditorDocument;
  ids: readonly string[];
  active: "move" | "resize" | null;
  snap: number;
  cancelToken: number;
  outline: boolean;
  onCommit: (gesture: SelectionGesture, translation: Vec3, scale: Vec3) => void;
  children: (worldOrigin: Vec3) => ReactNode;
}
/** One explicit target, one immutable source snapshot, one commit. */
export function SelectionTransform(props: Props) {
  const { gl, invalidate } = useThree();
  const anchor = useRef<Group>(null!);
  const gesture = useRef<SelectionGesture | null>(null);
  const idsKey = JSON.stringify(props.ids);
  const nodes = props.document.cuboids.filter(node => props.ids.includes(node.id));
  const bounds = selectionBounds(nodes)!;
  const origin: Vec3 = [(bounds.center[0] - 8) / 16, bounds.center[1] / 16, (bounds.center[2] - 8) / 16];
  const originRef = useRef(origin); originRef.current = origin;
  const rollback = () => {
    gesture.current = null;
    anchor.current?.position.set(...originRef.current);
    anchor.current?.scale.set(1, 1, 1);
    delete gl.domElement.dataset.selectionTransform;
    delete gl.domElement.dataset.selectionPreview;
    invalidate();
  };
  const previewChanged = () => {
    if (import.meta.env.DEV && gesture.current && anchor.current) {
      // Read-only diagnostic for real pointer tests. No document mutation API.
      gl.domElement.dataset.selectionPreview = JSON.stringify({
        position: anchor.current.position.toArray(), scale: anchor.current.scale.toArray()
      });
    }
    invalidate();
  };
  useEffect(() => {
    rollback();
    if (props.active) gl.domElement.dataset.selectionTransformReady = props.active;
    else delete gl.domElement.dataset.selectionTransformReady;
  }, [props.document, idsKey, props.active, props.cancelToken]);
  useEffect(() => {
    const cancel = () => { if (gesture.current) rollback(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    const visibility = () => { if (document.hidden) cancel(); };
    const lostCapture = () => queueMicrotask(cancel);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("lostpointercapture", lostCapture, true);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("lostpointercapture", lostCapture, true);
      document.removeEventListener("visibilitychange", visibility);
      gesture.current = null;
      delete gl.domElement.dataset.selectionTransform;
      delete gl.domElement.dataset.selectionTransformReady;
      delete gl.domElement.dataset.selectionPreview;
    };
  }, [gl]);
  const content = <group ref={anchor} position={origin}>
    {props.children(origin)}
    {props.outline && <group scale={[bounds.size[0] / 16, bounds.size[1] / 16, bounds.size[2] / 16]}>
      <box3Helper args={[unitBox, 0x80dbbf]} raycast={() => {}}/>
    </group>}
  </group>;
  if (!props.active) return content;
  return <TransformControls object={anchor} mode={props.active === "move" ? "translate" : "scale"}
    translationSnap={props.snap / 16} scaleSnap={0.125} size={0.85}
    onChange={previewChanged}
    onMouseDown={() => {
      gesture.current = beginSelectionGesture(props.document, props.ids);
      gl.domElement.dataset.selectionTransform = "active";
      previewChanged();
    }}
    onMouseUp={() => {
      const captured = gesture.current, group = anchor.current;
      if (!captured || !group) { rollback(); return; }
      const translation: Vec3 = [
        group.position.x * 16 + 8 - captured.pivot[0],
        group.position.y * 16 - captured.pivot[1],
        group.position.z * 16 + 8 - captured.pivot[2]
      ];
      const scale: Vec3 = [group.scale.x, group.scale.y, group.scale.z];
      rollback();
      props.onCommit(captured, translation, scale);
    }}>{content}</TransformControls>;
}
