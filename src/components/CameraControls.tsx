import { useEffect, useRef } from "react";
import type { ComponentRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { EditorDocument } from "../editor/domain";
import { calculateFrameBounds, frameCameraDistance } from "../editor/frameSelection";
import type { ViewKind, ViewRequest } from "./EditorViewport";

interface CameraMove {
  elapsed: number;
  startPosition: THREE.Vector3;
  endPosition: THREE.Vector3;
  startTarget: THREE.Vector3;
  endTarget: THREE.Vector3;
}

export function CameraControls({ view, document, selectedIds }: {
  view: ViewRequest;
  document: EditorDocument;
  selectedIds: readonly string[];
}) {
  const { camera, invalidate } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const movement = useRef<CameraMove | null>(null);
  useFrame((_, delta) => {
    const orbit = controls.current, move = movement.current;
    if (!orbit || !move) return;
    move.elapsed = Math.min(0.45, move.elapsed + Math.min(delta, 0.05));
    const t = move.elapsed / 0.45;
    const eased = t * t * (3 - 2 * t);
    camera.position.lerpVectors(move.startPosition, move.endPosition, eased);
    orbit.target.lerpVectors(move.startTarget, move.endTarget, eased);
    orbit.update();
    if (t === 1) movement.current = null;
    else invalidate(); // frameloop="demand" needs a new frame throughout the animation.
  });
  useEffect(() => {
    const orbit = controls.current;
    if (!orbit) return;
    if (view.kind !== "frame" && view.kind !== "frame-all") {
      movement.current = null;
      const positions: Record<ViewKind, [number, number, number]> = {
        iso: [2.9, 2.35, 3.2], front: [0, 0.65, 4], right: [4, 0.65, 0], top: [0, 4, 0.001]
      };
      camera.position.set(...positions[view.kind]);
      orbit.target.set(0, 0.58, 0);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.near = 0.01; camera.far = 100; camera.updateProjectionMatrix();
      }
      orbit.update(); invalidate();
      return;
    }
    const bounds = calculateFrameBounds(document, view.kind === "frame-all" ? [] : selectedIds);
    const perspective = camera instanceof THREE.PerspectiveCamera ? camera : null;
    const distance = frameCameraDistance(bounds.radius, perspective?.fov ?? 40,
      perspective?.aspect ?? 1);
    const direction = camera.position.clone().sub(orbit.target);
    if (direction.lengthSq() < 1e-8) direction.set(1, 0.8, 1);
    direction.normalize();
    const target = new THREE.Vector3(...bounds.center);
    if (perspective) {
      perspective.near = Math.max(0.000001, Math.min(0.1, distance / 1000));
      perspective.far = Math.max(100, distance + bounds.radius * 4);
      perspective.updateProjectionMatrix();
    }
    movement.current = {
      elapsed: 0,
      startPosition: camera.position.clone(),
      endPosition: target.clone().addScaledVector(direction, distance),
      startTarget: orbit.target.clone(), endTarget: target
    };
    invalidate();
    // This effect intentionally follows the explicit view request, not document
    // mutations or selection changes: an ordinary edit must not move the camera.
  }, [camera, invalidate, view]);
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.095}
    minDistance={0.001} maxDistance={2000} enablePan screenSpacePanning
    onStart={() => { movement.current = null; }}/>;
}
