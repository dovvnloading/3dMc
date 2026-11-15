import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

export const RIGHT_CLICK_DRAG_THRESHOLD = 4;

export function isRightClickDrag(start: { x: number; y: number },
  end: { x: number; y: number }): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) > RIGHT_CLICK_DRAG_THRESHOLD;
}

/**
 * Native canvas contextmenu events are independent of R3F click selection.
 * Raycasting only on invocation finds the actual rotated/overlapping mesh
 * under the pointer; the gizmos, lights and grid never become scene targets.
 */
export function ViewportContextTarget({ onOpen }: {
  onOpen: (id: string | null, x: number, y: number, canvas: HTMLCanvasElement) => void;
}) {
  const { camera, scene, gl } = useThree();
  const latestOpen = useRef(onOpen);
  latestOpen.current = onOpen;

  useEffect(() => {
    const canvas = gl.domElement;
    canvas.tabIndex = 0;
    const raycaster = new THREE.Raycaster();
    let start: { x: number; y: number; pointerId: number; dragged: boolean } | null = null;
    const down = (event: PointerEvent) => {
      if (event.button === 2)
        start = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, dragged: false };
      else start = null;
    };
    const move = (event: PointerEvent) => {
      if (start && event.pointerId === start.pointerId && isRightClickDrag(start, {
        x: event.clientX, y: event.clientY
      })) start.dragged = true;
    };
    const up = (event: PointerEvent) => {
      if (start && event.pointerId === start.pointerId && isRightClickDrag(start, {
        x: event.clientX, y: event.clientY
      })) start.dragged = true;
    };
    const cancel = () => { start = null; };
    const context = (event: MouseEvent) => {
      if (start?.dragged || start && isRightClickDrag(start, {
        x: event.clientX, y: event.clientY
      })) { start = null; return; }
      start = null;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      raycaster.setFromCamera(new THREE.Vector2(
        (event.clientX - rect.left) / rect.width * 2 - 1,
        -(event.clientY - rect.top) / rect.height * 2 + 1
      ), camera);
      const hit = raycaster.intersectObjects(scene.children, true)
        .find(result => typeof result.object.userData.contextElementId === "string");
      const id = hit?.object.userData.contextElementId as string | undefined;
      event.preventDefault(); // Only suppress the browser menu when opening ours.
      latestOpen.current(id ?? null, event.clientX, event.clientY, canvas);
    };
    canvas.addEventListener("pointerdown", down, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancel, true);
    canvas.addEventListener("contextmenu", context);
    return () => {
      canvas.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true);
      canvas.removeEventListener("contextmenu", context);
    };
  }, [camera, scene, gl]);
  return null;
}
