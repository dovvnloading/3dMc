import { useEffect, useRef } from "react";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { Vec3 } from "../editor/domain";
import { JAVA_ELEMENT_ANGLES } from "../editor/elementRotation";
import type { ElementAngle, ElementAxis } from "../editor/elementRotation";

interface Props {
  axis: ElementAxis;
  angle: ElementAngle;
  position: Vec3;
  /** Global world position, needed for ray/plane calculations. */
  worldPivot: Vec3;
  radius: number;
  cancelToken: number;
  onPreview: (angle: ElementAngle | null) => void;
  onCommit: (angle: ElementAngle) => void;
}
interface Drag {
  pointerId: number;
  initial: ElementAngle;
  start: THREE.Vector3;
  candidate: ElementAngle;
}

const axisVector = (axis: ElementAxis) => new THREE.Vector3(
  axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0
);
const ringEuler = (axis: ElementAxis): Vec3 =>
  axis === "x" ? [0, Math.PI / 2, 0] : axis === "y" ? [-Math.PI / 2, 0, 0] : [0, 0, 0];
const axisColor = (axis: ElementAxis) =>
  axis === "x" ? "#ea8f8f" : axis === "y" ? "#90d0a4" : "#8eb6f2";

/** A constrained on-canvas ring: the document never sees intermediate/free angles. */
export function RotationHandle(props: Props) {
  const { invalidate, controls } = useThree();
  const allowCameraOrbit = (enabled: boolean) => {
    if (controls && "enabled" in controls && typeof controls.enabled === "boolean")
      controls.enabled = enabled;
  };
  const drag = useRef<Drag | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const cancel = () => {
    if (!drag.current) return;
    drag.current = null;
    allowCameraOrbit(true);
    latest.current.onPreview(null);
    invalidate();
  };
  const contact = (event: ThreeEvent<PointerEvent>): THREE.Vector3 | null => {
    const pivot = new THREE.Vector3(...latest.current.worldPivot);
    const axis = axisVector(latest.current.axis);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axis, pivot);
    const hit = event.ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit) return null;
    const direction = hit.sub(pivot);
    return direction.lengthSq() < 1e-10 ? null : direction.normalize();
  };
  const sample = (event: ThreeEvent<PointerEvent>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const vector = contact(event);
    if (!vector) return;
    const axis = axisVector(latest.current.axis);
    const degrees = Math.atan2(
      new THREE.Vector3().crossVectors(current.start, vector).dot(axis),
      current.start.dot(vector)) * 180 / Math.PI;
    const requested = current.initial + degrees;
    const candidate = JAVA_ELEMENT_ANGLES.reduce((best, next) =>
      Math.abs(next - requested) < Math.abs(best - requested) ? next : best);
    if (candidate === current.candidate) return;
    current.candidate = candidate;
    latest.current.onPreview(candidate);
    invalidate();
  };
  const pointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    const start = contact(event);
    if (!start) return;
    event.stopPropagation();
    drag.current = { pointerId: event.pointerId, start, initial: latest.current.angle,
      candidate: latest.current.angle };
    allowCameraOrbit(false);
    (event.target as EventTarget & { setPointerCapture?: (id: number) => void })
      .setPointerCapture?.(event.pointerId);
  };
  const pointerUp = (event: ThreeEvent<PointerEvent>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    sample(event);
    const candidate = current.candidate;
    drag.current = null;
    allowCameraOrbit(true);
    latest.current.onPreview(null);
    const target = event.target as EventTarget & {
      hasPointerCapture?: (id: number) => boolean;
      releasePointerCapture?: (id: number) => void;
    };
    if (target.hasPointerCapture?.(event.pointerId))
      target.releasePointerCapture?.(event.pointerId);
    if (candidate !== current.initial) latest.current.onCommit(candidate);
    invalidate();
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drag.current) {
        event.preventDefault(); event.stopImmediatePropagation(); cancel();
      }
    };
    const hidden = () => { if (document.hidden) cancel(); };
    const lost = () => queueMicrotask(cancel);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("lostpointercapture", lost, true);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("lostpointercapture", lost, true);
      document.removeEventListener("visibilitychange", hidden);
      cancel();
    };
  }, [invalidate]);
  useEffect(() => { cancel(); }, [props.cancelToken, props.axis]);
  return <group position={props.position}>
    <mesh rotation={ringEuler(props.axis)} renderOrder={11}
      onPointerDown={pointerDown} onPointerMove={event => {
        if (drag.current) { event.stopPropagation(); sample(event); }
      }} onPointerUp={pointerUp} onPointerCancel={cancel}>
      <torusGeometry args={[props.radius, 0.027, 9, 80]}/>
      <meshBasicMaterial color={axisColor(props.axis)} depthTest={false} depthWrite={false}/>
    </mesh>
    <Html position={[0, props.radius + 0.12, 0]} center distanceFactor={8} style={{ pointerEvents: "none" }}>
      <div className="rotation-handle-label">{props.axis.toUpperCase()} · {drag.current?.candidate ?? props.angle}°</div>
    </Html>
  </group>;
}
