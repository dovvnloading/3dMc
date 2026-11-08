import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Edges, OrbitControls, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import type { Cuboid, EditorDocument, FaceDirection, Vec3 } from "../editor/domain";
import { applyFaceUvs, faceFromTriangle } from "../editor/uv";
import { uvToTexel } from "../editor/pixels";
import type { Texel } from "../editor/pixels";

export type Mode = "model" | "paint" | "preview";
export type Tool = "select" | "move" | "resize" | "pencil" | "eyedropper";
export type ViewKind = "iso" | "front" | "right" | "top";
export type ViewRequest = { kind: ViewKind; count: number };

interface ViewportProps {
  document: EditorDocument;
  pixels: number[];
  selectedId: string | null;
  selectedFace: FaceDirection;
  mode: Mode;
  tool: Tool;
  view: ViewRequest;
  snap: number;
  painting: boolean;
  onSelect: (id: string | null) => void;
  onSelectFace: (face: FaceDirection) => void;
  onBeginPaint: (texel: Texel, face: string) => void;
  onContinuePaint: (texel: Texel, face: string) => void;
  onFinishPaint: () => void;
  onCancelPaint: () => void;
  onSample: (texel: Texel) => void;
  onTransform: (id: string, position: Vec3, scale: Vec3) => void;
}

const WORLD = 16;
const vec = (values: readonly number[]): Vec3 => [values[0]!, values[1]!, values[2]!];
const center = (node: Cuboid): Vec3 => [
  (node.from[0] + node.to[0] - 16) / (WORLD * 2),
  (node.from[1] + node.to[1]) / (WORLD * 2),
  (node.from[2] + node.to[2] - 16) / (WORLD * 2)
];
const dimensions = (node: Cuboid): Vec3 => [
  (node.to[0] - node.from[0]) / WORLD,
  (node.to[1] - node.from[1]) / WORLD,
  (node.to[2] - node.from[2]) / WORLD
];

function CameraControls({ view }: { view: ViewRequest }) {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    const positions: Record<ViewKind, [number, number, number]> = {
      iso: [2.9, 2.35, 3.2],
      front: [0, 0.65, 4],
      right: [4, 0.65, 0],
      top: [0, 4, 0.001]
    };
    camera.position.set(...positions[view.kind]);
    camera.lookAt(0, 0.58, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate, view]);
  return <OrbitControls makeDefault enableDamping dampingFactor={0.095}
    target={[0, 0.58, 0]} minDistance={0.9} maxDistance={25}
    enablePan screenSpacePanning />;
}

function useTextureMap({ width, height, pixels }: {
  width: number; height: number; pixels: number[];
}): THREE.CanvasTexture {
  const { invalidate } = useThree();
  const resource = useMemo(() => {
    const canvas = globalThis.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    return { canvas, texture };
  }, [width, height]);

  useEffect(() => {
    const context = resource.canvas.getContext("2d");
    if (context) context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
    resource.texture.needsUpdate = true;
    invalidate();
  }, [resource, pixels, width, height, invalidate]);

  useEffect(() => () => resource.texture.dispose(), [resource]);
  return resource.texture;
}

type MeshProps = Pick<ViewportProps, "selectedId" | "selectedFace" | "mode" | "tool" | "snap" | "painting" |
"onSelect" | "onSelectFace" | "onBeginPaint" | "onContinuePaint" | "onFinishPaint" |
"onCancelPaint" | "onSample" | "onTransform"> & { node: Cuboid; texture: THREE.Texture; width: number; height: number };

function FaceHighlight({ node, face }: { node: Cuboid; face: FaceDirection }) {
  const [sx, sy, sz] = dimensions(node);
  const epsilon = 0.0014;
  const placements: Record<FaceDirection, {
    position: Vec3; rotation: Vec3; size: readonly [number, number]
  }> = {
    east: { position: [sx / 2 + epsilon, 0, 0], rotation: [0, Math.PI / 2, 0], size: [sz, sy] },
    west: { position: [-sx / 2 - epsilon, 0, 0], rotation: [0, -Math.PI / 2, 0], size: [sz, sy] },
    up: { position: [0, sy / 2 + epsilon, 0], rotation: [-Math.PI / 2, 0, 0], size: [sx, sz] },
    down: { position: [0, -sy / 2 - epsilon, 0], rotation: [Math.PI / 2, 0, 0], size: [sx, sz] },
    south: { position: [0, 0, sz / 2 + epsilon], rotation: [0, 0, 0], size: [sx, sy] },
    north: { position: [0, 0, -sz / 2 - epsilon], rotation: [0, Math.PI, 0], size: [sx, sy] }
  };
  const placement = placements[face];
  return <mesh position={placement.position} rotation={placement.rotation} renderOrder={5}>
    <planeGeometry args={[placement.size[0], placement.size[1]]}/>
    <meshBasicMaterial color="#80dbbf" side={THREE.DoubleSide} transparent opacity={0.15}
      depthWrite={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1}/>
  </mesh>;
}

function AssetMesh(props: MeshProps) {
  const { node, selectedId, mode, tool, painting } = props;
  const anchor = useRef<THREE.Group>(null);
  const initialPosition = center(node);
  const geometry = useMemo(() => {
    const box = new THREE.BoxGeometry(...dimensions(node));
    applyFaceUvs(box, node.faces);
    return box;
  }, [node.from, node.to, node.faces]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const isSelected = selectedId === node.id;
  const activeGizmo = isSelected && mode === "model" && !node.locked &&
    (tool === "move" || tool === "resize") ? tool : null;

  const onHit = (event: ThreeEvent<PointerEvent>): { texel: Texel; face: string } | null => {
    const direction = faceFromTriangle(event.faceIndex ?? -1);
    if (node.material !== "texture" || !event.uv || !direction) return null;
    return {
      texel: uvToTexel(event.uv.x, event.uv.y, props.width, props.height),
      face: node.id + ":" + direction
    };
  };

  const handleDown = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || mode !== "paint") return;
    const hit = onHit(event);
    if (!hit) return;
    event.stopPropagation();
    props.onSelect(node.id);
    const direction = faceFromTriangle(event.faceIndex ?? -1);
    if (direction) props.onSelectFace(direction);
    if (tool === "eyedropper") { props.onSample(hit.texel); return; }
    if (tool !== "pencil" || node.locked) return;
    const capture = event.target as (EventTarget & { setPointerCapture?: (id: number) => void }) | null;
    capture?.setPointerCapture?.(event.pointerId);
    props.onBeginPaint(hit.texel, hit.face);
  };
  const handleMove = (event: ThreeEvent<PointerEvent>) => {
    if (!painting || mode !== "paint" || tool !== "pencil") return;
    const hit = onHit(event);
    if (hit) props.onContinuePaint(hit.texel, hit.face);
  };
  const handleUp = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || mode !== "paint" || tool !== "pencil") return;
    event.stopPropagation();
    const capture = event.target as (EventTarget & {
      hasPointerCapture?: (id: number) => boolean;
      releasePointerCapture?: (id: number) => void;
    }) | null;
    if (capture?.hasPointerCapture?.(event.pointerId)) capture.releasePointerCapture?.(event.pointerId);
    props.onFinishPaint();
  };

  const mesh = (
    <group ref={anchor} position={initialPosition}>
      <mesh castShadow receiveShadow
        onClick={(event) => {
          event.stopPropagation();
          if (mode !== "paint" && !node.locked) {
            props.onSelect(node.id);
            const face = faceFromTriangle(event.faceIndex ?? -1);
            if (face) props.onSelectFace(face);
          }
        }}
        onPointerDown={handleDown} onPointerMove={handleMove}
        onPointerUp={handleUp} onPointerCancel={() => props.onCancelPaint()}>
        
        <primitive object={geometry} attach="geometry" />
        <meshStandardMaterial color={node.color} map={node.material === "texture" ? props.texture : null}
          roughness={node.material === "solid" ? 0.48 : 0.95} metalness={node.material === "solid" ? 0.18 : 0} />
        {isSelected && mode !== "preview" && <Edges color="#80dbbf" threshold={15} scale={1.004} />}
      </mesh>
      {isSelected && mode !== "preview" && <FaceHighlight node={node} face={props.selectedFace}/>}
    </group>
  );

  if (!activeGizmo) return mesh;

  return <TransformControls mode={activeGizmo === "move" ? "translate" : "scale"}
    translationSnap={props.snap / WORLD} scaleSnap={0.125} size={0.74}
    onMouseUp={() => {
      const object = anchor.current;
      if (!object) return;
      props.onTransform(node.id, vec(object.position.toArray()), vec(object.scale.toArray()));
      // Restore presentation while the domain commit updates the node.
      object.position.set(...initialPosition);
      object.scale.set(1, 1, 1);
    }}>
    {mesh}
  </TransformControls>;
}

function Scene(props: ViewportProps) {
  const texture = useTextureMap({ width: props.document.texture.width,
    height: props.document.texture.height, pixels: props.pixels });
  return <>
    <color attach="background" args={["#141619"]} />
    <ambientLight intensity={1.35} />
    <directionalLight position={[3, 6, 4]} intensity={2.3} castShadow
      shadow-mapSize={[1024, 1024]} shadow-camera-near={0.1}
      shadow-camera-far={20} />
    <directionalLight position={[-3, 2, -4]} intensity={0.85} color="#a3c8be" />
    {props.mode !== "preview" && <gridHelper args={[10, 20, "#33483f", "#242c2b"]} position={[0, 0, 0]} />}
    {props.document.cuboids.filter((node) => node.visible).map((node) =>
      <AssetMesh key={node.id} {...props} node={node} texture={texture}
        width={props.document.texture.width} height={props.document.texture.height} />)}
    <CameraControls view={props.view} />
  </>;
}

export function EditorViewport(props: ViewportProps) {
  return <div className={"viewport-canvas viewport-" + props.mode}>
    <Canvas camera={{ position: [2.9, 2.35, 3.2], fov: 40, near: 0.01, far: 100 }}
      frameloop="demand" shadows dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      fallback={<div className="webgl-fallback">3D rendering is unavailable. Your project remains editable through the Scene and Inspector.</div>}
      onPointerMissed={() => { if (props.mode === "model" && props.tool === "select") props.onSelect(null); }}>
      <Scene {...props} />
    </Canvas>
  </div>;
}
