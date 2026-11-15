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
    let start: {
      x: number; y: number; pointerId: number; dragged: boolean;
      pending: boolean; released: boolean; opened: boolean;
    } | null = null;
    const open = (x: number, y: number) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      raycaster.setFromCamera(new THREE.Vector2(
        (x - rect.left) / rect.width * 2 - 1,
        -(y - rect.top) / rect.height * 2 + 1
      ), camera);
      const hit = raycaster.intersectObjects(scene.children, true)
        .find(result => typeof result.object.userData.contextElementId === "string");
      const id = hit?.object.userData.contextElementId as string | undefined;
      latestOpen.current(id ?? null, x, y, canvas);
    };
    const down = (event: PointerEvent) => {
      if (event.button === 2)
        start = { x: event.clientX, y: event.clientY, pointerId: event.pointerId,
          dragged: false, pending: false, released: false, opened: false };
      else start = null;
    };
    const move = (event: PointerEvent) => {
      if (start && event.pointerId === start.pointerId && isRightClickDrag(start, {
        x: event.clientX, y: event.clientY
      })) start.dragged = true;
    };
    const up = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.pointerId || event.button !== 2) return;
      if (isRightClickDrag(start, { x: event.clientX, y: event.clientY })) start.dragged = true;
      start.released = true;
      // Firefox and WebKit can dispatch contextmenu at pointerdown. Never
      // open it until release, when the user might have dragged the camera.
      if (start.pending && !start.dragged) {
        start.opened = true;
        open(event.clientX, event.clientY);
      }
    };
    const cancel = () => { start = null; };
    const context = (event: MouseEvent) => {
      if (start?.opened) { // Do not open twice if a browser fires a second event.
        event.preventDefault();
        start = null;
        return;
      }
      if (start?.dragged || start && isRightClickDrag(start, {
        x: event.clientX, y: event.clientY
      })) { start = null; return; }
      if (start && !start.released) {
        // An early contextmenu must be deferred; a subsequent drag cancels it.
        // Suppression here is unavoidable before the browser knows whether
        // the right-button gesture will end in a click or camera drag.
        event.preventDefault();
        start.pending = true;
        return;
      }
      start = null;
      event.preventDefault();
      open(event.clientX, event.clientY);
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
