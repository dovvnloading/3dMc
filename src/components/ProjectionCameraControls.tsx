import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { ComponentRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { EditorDocument } from "../editor/domain";
import { calculateFrameBounds, frameCameraDistance } from "../editor/frameSelection";
import type { FrameBounds } from "../editor/frameSelection";
import { MIN_CAMERA_SCALE, orthographicFrameHalfHeight, orthographicVisibleHalfHeight,
  perspectiveDistanceForHalfHeight, perspectiveHalfHeight, projectionClipping, VIEWPORT_FOV } from "../editor/viewportProjection";
import type { ViewportProjection } from "../editor/viewportProjection";
import type { ViewKind, ViewRequest } from "./EditorViewport";

type ViewCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;
interface CameraMove {
  elapsed: number;
  startPosition: THREE.Vector3;
  endPosition: THREE.Vector3;
  startTarget: THREE.Vector3;
  endTarget: THREE.Vector3;
  startHalfHeight?: number;
  endHalfHeight?: number;
}

function canvasAspect(width: number, height: number): number {
  return width > 0 && height > 0 ? width / height : 1;
}

/** Adjust the frustum rather than multiplying zoom by enormous scale ratios. */
function setOrthographicSpan(camera: THREE.OrthographicCamera, halfHeight: number, aspect: number): void {
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}

/**
 * Orthographic zoom changes the image scale but does not dolly the camera.
 * Move it back along its current ray as the visible span grows. Otherwise a
 * zoomed-out view after framing a tiny element can slice a larger model.
 */
function updateDepth(camera: ViewCamera, target: THREE.Vector3,
  focusRadius: number, aspect: number, sceneBounds: FrameBounds,
  showGrid: boolean, dollyOrthographic = true): void {
  // Keep the remainder of the model visible when framing a selection.
  // An extreme size disparity should prioritize precision of the tiny focus.
  const includeScene = sceneBounds.radius / Math.max(focusRadius, MIN_CAMERA_SCALE) < 1e5;
  const sceneCenter = new THREE.Vector3(...sceneBounds.center);
  let depthRadius = focusRadius;
  if (camera instanceof THREE.OrthographicCamera) {
    const halfHeight = orthographicVisibleHalfHeight(camera.top, camera.bottom, camera.zoom);
    depthRadius = Math.max(depthRadius, halfHeight * Math.max(1, aspect));
    if (includeScene) depthRadius = Math.max(depthRadius,
      sceneBounds.radius + target.distanceTo(sceneCenter));
    if (dollyOrthographic) {
      const direction = camera.position.clone().sub(target);
      if (direction.lengthSq() < MIN_CAMERA_SCALE * MIN_CAMERA_SCALE) direction.set(1, 0.8, 1);
      direction.normalize();
      camera.position.copy(target).addScaledVector(direction, Math.max(MIN_CAMERA_SCALE, depthRadius * 4));
    }
  }
  const distance = Math.max(MIN_CAMERA_SCALE, camera.position.distanceTo(target));
  const sceneFar = includeScene ? camera.position.distanceTo(sceneCenter) + sceneBounds.radius * 1.5 : 0;
  // The legacy ten-unit grid reaches about seven units from the origin.
  // Skip distant grid depth at microscopic focus scales to avoid depth-buffer
  // precision loss on very thin selections.
  const gridFar = showGrid && focusRadius >= 0.01 ? camera.position.length() + 8 : 0;
  const planes = projectionClipping(distance, depthRadius, Math.max(sceneFar, gridFar));
  if (camera.near !== planes.near || camera.far !== planes.far) {
    camera.near = planes.near;
    camera.far = planes.far;
    camera.updateProjectionMatrix();
  }
}

export function ProjectionCameraControls({ view, projection, document, selectedIds, showGrid }: {
  view: ViewRequest;
  projection: ViewportProjection;
  document: EditorDocument;
  selectedIds: readonly string[];
  showGrid: boolean;
}) {
  const { camera, set, invalidate, size, gl } = useThree();
  const aspect = canvasAspect(size.width, size.height);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const movement = useRef<CameraMove | null>(null);
  const target = useRef(new THREE.Vector3(0, 0.58, 0));
  const sceneBounds = useMemo(() => calculateFrameBounds(document, []), [document.cuboids]);
  const focusRadius = useRef<number | null>(null);
  if (focusRadius.current === null) focusRadius.current = sceneBounds.radius;
  const cameras = useRef<{ perspective: THREE.PerspectiveCamera; orthographic: THREE.OrthographicCamera } | null>(null);
  if (!cameras.current) {
    const perspective = camera instanceof THREE.PerspectiveCamera ? camera :
      new THREE.PerspectiveCamera(VIEWPORT_FOV, aspect, 0.01, 100);
    const orthographic = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.01, 100);
    // R3F otherwise rewrites top/bottom to ±canvasHeight/2 every time a
    // mode switch changes the canvas size, shrinking the whole model to a dot.
    // We own the ortho frustum and update its aspect ourselves below.
    (orthographic as THREE.OrthographicCamera & { manual?: boolean }).manual = true;
    cameras.current = { perspective, orthographic };
  }

  const cameraRef = useRef(camera as ViewCamera);
  cameraRef.current = camera as ViewCamera;

  const diagnostics = useCallback((active: ViewCamera) => {
    if (!import.meta.env.DEV) return;
    const direction = active.position.clone().sub(target.current).normalize();
    const halfHeight = active instanceof THREE.PerspectiveCamera ?
      perspectiveHalfHeight(active.position.distanceTo(target.current), active.fov, active.zoom) :
      orthographicVisibleHalfHeight(active.top, active.bottom, active.zoom);
    // Read-only diagnostics let cross-browser tests inspect the actual camera,
    // not a separate state approximation or a document mutation endpoint.
    gl.domElement.dataset.cameraProjection = active instanceof THREE.OrthographicCamera ? "orthographic" : "perspective";
    gl.domElement.dataset.cameraDirection = JSON.stringify(direction.toArray());
    gl.domElement.dataset.cameraTarget = JSON.stringify(target.current.toArray());
    gl.domElement.dataset.cameraHalfHeight = String(halfHeight);
    gl.domElement.dataset.cameraClipping = JSON.stringify([active.near, active.far]);
  }, [gl]);

  const sync = useCallback((dolly = true) => {
    const orbit = controls.current;
    if (!orbit) return;
    target.current.copy(orbit.target);
    const active = cameraRef.current;
    updateDepth(active, target.current, focusRadius.current ?? 1, aspect,
      sceneBounds, showGrid, dolly && !movement.current);
    diagnostics(active);
    invalidate();
  }, [aspect, diagnostics, invalidate, sceneBounds, showGrid]);

  // Change R3F's actual default camera; raycasting, painting and drei gizmos
  // all consume this same camera, rather than a visual-only projection layer.
  useLayoutEffect(() => {
    const isOrthographic = camera instanceof THREE.OrthographicCamera;
    if (isOrthographic === (projection === "orthographic")) return;
    movement.current = null;
    const orbitTarget = controls.current?.target.clone() ?? target.current.clone();
    target.current.copy(orbitTarget);
    const previous = camera as ViewCamera;
    const direction = previous.position.clone().sub(orbitTarget);
    const originalDistance = Math.max(MIN_CAMERA_SCALE, direction.length());
    if (direction.lengthSq() < MIN_CAMERA_SCALE * MIN_CAMERA_SCALE) direction.set(1, 0.8, 1);
    direction.normalize();
    const next = projection === "orthographic" ? cameras.current!.orthographic : cameras.current!.perspective;
    next.up.copy(previous.up);
    next.zoom = 1;
    if (next instanceof THREE.OrthographicCamera && previous instanceof THREE.PerspectiveCamera) {
      setOrthographicSpan(next, perspectiveHalfHeight(originalDistance, previous.fov, previous.zoom), aspect);
      next.position.copy(previous.position);
    } else if (next instanceof THREE.PerspectiveCamera && previous instanceof THREE.OrthographicCamera) {
      const halfHeight = orthographicVisibleHalfHeight(previous.top, previous.bottom, previous.zoom);
      next.aspect = aspect;
      next.position.copy(orbitTarget).addScaledVector(direction,
        perspectiveDistanceForHalfHeight(halfHeight, next.fov));
    }
    next.lookAt(orbitTarget);
    updateDepth(next, orbitTarget, focusRadius.current ?? 1, aspect, sceneBounds, showGrid);
    next.updateMatrixWorld(true);
    cameraRef.current = next;
    diagnostics(next);
    set({ camera: next });
    invalidate();
  }, [projection, camera, aspect, diagnostics, invalidate, set, sceneBounds, showGrid]);

  // R3F updates perspective aspect automatically on resize, but orthographic
  // horizontal span needs an explicit update. Either projection must also
  // refresh clipping after a model edit or grid toggle without moving the view.
  useEffect(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      const span = Math.abs(camera.top - camera.bottom) / 2;
      setOrthographicSpan(camera, span, aspect);
    }
    sync(false);
  }, [camera, aspect, sync]);

  const onChange = useCallback(() => sync(), [sync]);
  useFrame((_, delta) => {
    const orbit = controls.current, move = movement.current, active = cameraRef.current;
    if (!orbit || !move) return;
    move.elapsed = Math.min(0.45, move.elapsed + Math.min(delta, 0.05));
    const t = move.elapsed / 0.45;
    const eased = t * t * (3 - 2 * t);
    active.position.lerpVectors(move.startPosition, move.endPosition, eased);
    orbit.target.lerpVectors(move.startTarget, move.endTarget, eased);
    if (active instanceof THREE.OrthographicCamera && move.startHalfHeight && move.endHalfHeight) {
      const height = Math.exp(Math.log(move.startHalfHeight) * (1 - eased) +
        Math.log(move.endHalfHeight) * eased);
      setOrthographicSpan(active, height, aspect);
    }
    orbit.update();
    if (t === 1) {
      movement.current = null;
      sync();
    } else invalidate(); // demand frameloop requires every animation frame.
  });

  // Depend on the explicit request nonce only: edits, selection changes and
  // projection toggles must never unexpectedly reset the user's orbit/pan.
  useEffect(() => {
    const orbit = controls.current, active = cameraRef.current;
    if (!orbit) return;
    movement.current = null;
    if (view.kind !== "frame" && view.kind !== "frame-all") {
      const positions: Record<ViewKind, [number, number, number]> = {
        iso: [2.9, 2.35, 3.2], front: [0, 0.65, 4], right: [4, 0.65, 0], top: [0, 4, 0.001]
      };
      const position = new THREE.Vector3(...positions[view.kind]);
      const home = new THREE.Vector3(0, 0.58, 0);
      if (active instanceof THREE.OrthographicCamera) {
        active.zoom = 1;
        setOrthographicSpan(active, perspectiveHalfHeight(position.distanceTo(home)), aspect);
      } else {
        active.zoom = 1;
        active.aspect = aspect;
      }
      active.position.copy(position);
      orbit.target.copy(home);
      focusRadius.current = calculateFrameBounds(document, []).radius;
      orbit.update();
      sync();
      return;
    }
    const bounds = calculateFrameBounds(document, view.kind === "frame-all" ? [] : selectedIds);
    focusRadius.current = bounds.radius;
    const direction = active.position.clone().sub(orbit.target);
    if (direction.lengthSq() < MIN_CAMERA_SCALE * MIN_CAMERA_SCALE) direction.set(1, 0.8, 1);
    direction.normalize();
    const endTarget = new THREE.Vector3(...bounds.center);
    let distance: number;
    let startHalfHeight: number | undefined, endHalfHeight: number | undefined;
    if (active instanceof THREE.OrthographicCamera) {
      startHalfHeight = orthographicVisibleHalfHeight(active.top, active.bottom, active.zoom);
      active.zoom = 1;
      setOrthographicSpan(active, startHalfHeight, aspect);
      endHalfHeight = orthographicFrameHalfHeight(bounds.radius, aspect);
      distance = Math.max(endHalfHeight * 4, bounds.radius * 4);
    } else {
      distance = frameCameraDistance(bounds.radius, active.fov, active.aspect);
    }
    movement.current = {
      elapsed: 0, startPosition: active.position.clone(),
      endPosition: endTarget.clone().addScaledVector(direction, distance),
      startTarget: orbit.target.clone(), endTarget, startHalfHeight, endHalfHeight
    };
    invalidate();
  // view.count is the request nonce; not a reactive document or camera dependency.
  }, [view.count]);

  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.095}
    target={target.current.toArray()} minDistance={MIN_CAMERA_SCALE} maxDistance={1e15}
    minZoom={1e-12} maxZoom={1e12} enablePan screenSpacePanning
    onChange={onChange} onStart={() => { movement.current = null; }}/>;
}
