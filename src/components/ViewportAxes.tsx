import { Html } from "@react-three/drei";
import type { FrameBounds } from "../editor/frameSelection";

/** Non-interactive, labelled world axes. They must never steal pick/paint rays. */
export function ViewportAxes({ bounds }: { bounds: FrameBounds }) {
  const length = Math.max(1.25, bounds.radius * 1.2);
  const axes = [
    { label: "X", color: "#ff5151", point: [length, 0, 0] as const },
    { label: "Y", color: "#4fd877", point: [0, length, 0] as const },
    { label: "Z", color: "#508cff", point: [0, 0, length] as const }
  ];
  return <group>
    <axesHelper args={[length]} raycast={() => {}}/>
    {axes.map(axis => <Html key={axis.label} position={[axis.point[0], axis.point[1], axis.point[2]]} center pointerEvents="none">
      <span aria-label={axis.label + " axis"} style={{ color: axis.color, fontWeight: 800,
        fontSize: 13, textShadow: "0 1px 3px #111", pointerEvents: "none" }}>{axis.label}</span>
    </Html>)}
  </group>;
}
