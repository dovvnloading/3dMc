import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Edges, OrbitControls, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import type { Cuboid, EditorDocument, FaceDirection, Vec3, PixelTexture } from "../editor/domain";
import { applyFaceUvs, BOX_FACE_ORDER, faceFromTriangle } from "../editor/uv";
import { uvToTexel } from "../editor/pixels";
import type { Texel } from "../editor/pixels";

export type Mode = "model" | "paint" | "preview";
export type Tool = "select" | "move" | "resize" | "pencil" | "eraser" | "fill" | "eyedropper";
export type ViewKind = "iso" | "front" | "right" | "top";
export type ViewRequest = { kind: ViewKind; count: number };

interface ViewportProps {
  document: EditorDocument;
  pixels: number[];
  draftTextureId: string | null;
  selectedId: string | null;
  selectedFace: FaceDirection;
  mode: Mode;
  tool: Tool;
  view: ViewRequest;
  snap: number;
  painting: boolean;
  cancelToken: number;
  onSelect: (id: string | null) => void;
  onSelectFace: (face: FaceDirection) => void;
  onBeginPaint: (texel: Texel, face: string, textureId: string) => void;
  onContinuePaint: (texel: Texel, face: string, textureId: string) => void;
  onFinishPaint: () => void;
  onCancelPaint: () => void;
  onSample: (texel: Texel, textureId: string) => void;
  onFill: (texel: Texel, textureId: string) => void;
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

function useTextureMaps(textures: PixelTexture[], draftPixels: number[],
  draftTextureId: string | null, activeTextureId: string): Record<string, THREE.CanvasTexture> {
  const { invalidate } = useThree();
  const signature = textures.map(t => t.id + ":" + t.width + "x" + t.height).join("|");
  const resources = useMemo(() => {
    const resources: Record<string, { canvas: HTMLCanvasElement; map: THREE.CanvasTexture }> = {};
    textures.forEach(t => {
      const canvas = globalThis.document.createElement("canvas");
      canvas.width = t.width; canvas.height = t.height;
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestFilter;
      map.wrapS = THREE.ClampToEdgeWrapping; map.wrapT = THREE.ClampToEdgeWrapping;
      resources[t.id] = { canvas, map };
    });
    return resources;
    // Width/height/ID are intentionally the resource ownership key. RGB
    // updates below never allocate a new GPU map.
  }, [signature]);
  useEffect(() => {
    textures.forEach(t => {
      const resource = resources[t.id];
      const source = t.id === (draftTextureId ?? activeTextureId) ? draftPixels : t.pixels;
      if (!resource || source.length !== t.width * t.height * 4) return;
      const context = resource.canvas.getContext("2d");
      context?.putImageData(new ImageData(new Uint8ClampedArray(source), t.width, t.height), 0, 0);
      resource.map.needsUpdate = true;
    });
    invalidate();
  }, [resources, textures, draftPixels, draftTextureId, activeTextureId, invalidate]);
  useEffect(() => () => Object.values(resources).forEach(r => r.map.dispose()), [resources]);
  return Object.fromEntries(Object.entries(resources).map(([id, r]) => [id, r.map]));
}


/**
 * Opt-in development-only diagnostics. This is not shipped to the production
 * GitHub Pages bundle. Measures real R3F/WebGL resource counts and frame
 * intervals, rather than inferring texture allocation from ZIP byte counts.
 */
interface EditorDiagnostics {
  snapshot: () => {
    gpuTextures: number; gpuGeometries: number;
    drawCalls: number; triangles: number; renderedFrames: number;
    frameIntervalP50Ms: number | null; frameIntervalP95Ms: number | null;
    pixelRatio: number;
  };
  resetFrames: () => void;
}
type DiagnosticsWindow = Window & { __3dmcDiagnostics?: EditorDiagnostics };

function DevPerformanceProbe() {
  const { gl } = useThree();
  const samples = useRef<number[]>([]);
  const frameCount = useRef(0);
  const lastFrame = useRef<number | null>(null);
  useFrame(() => {
    const now = performance.now();
    if (lastFrame.current !== null) {
      const interval = now - lastFrame.current;
      if (interval > 0 && interval < 200) {
        samples.current.push(interval);
        if (samples.current.length > 200) samples.current.shift();
      }
    }
    lastFrame.current = now;
    frameCount.current += 1;
  });
  useEffect(() => {
    const target = window as DiagnosticsWindow;
    const percentile = (input: number[], percent: number) =>
      input.length ? [...input].sort((a, b) => a - b)[Math.min(
        input.length - 1, Math.floor((input.length - 1) * percent)
      )]! : null;
    const api: EditorDiagnostics = {
      snapshot: () => ({
        gpuTextures: gl.info.memory.textures,
        gpuGeometries: gl.info.memory.geometries,
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        renderedFrames: frameCount.current,
        frameIntervalP50Ms: percentile(samples.current, .5),
        frameIntervalP95Ms: percentile(samples.current, .95),
        pixelRatio: gl.getPixelRatio()
      }),
      resetFrames: () => {
        samples.current = [];
        frameCount.current = 0;
        lastFrame.current = null;
      }
    };
    target.__3dmcDiagnostics = api;
    return () => {
      if (target.__3dmcDiagnostics === api) delete target.__3dmcDiagnostics;
    };
  }, [gl]);
  return null;
}

type MeshProps = Pick<ViewportProps, "selectedId" | "selectedFace" | "mode" | "tool" | "snap" | "painting" |
"onSelect" | "onSelectFace" | "onBeginPaint" | "onContinuePaint" | "onFinishPaint" |
"onCancelPaint" | "onSample" | "onFill" | "onTransform" | "cancelToken"> & { node: Cuboid; textureMaps: Record<string, THREE.Texture>; textures: PixelTexture[] };

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
  const { node, selectedId, mode, tool } = props;
  const anchor = useRef<THREE.Group>(null);
  const draggingGizmo = useRef(false);
  const cancelledGizmo = useRef(false);
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
  const rollbackGizmo = () => {
    cancelledGizmo.current = true;
    draggingGizmo.current = false;
    anchor.current?.position.set(...center(node));
    anchor.current?.scale.set(1, 1, 1);
  };
  useEffect(() => {
    rollbackGizmo();
  }, [props.cancelToken, activeGizmo]);
  useEffect(() => {
    const abort = (event: KeyboardEvent) => {
      if (event.key === "Escape" && draggingGizmo.current) rollbackGizmo();
    };
    const lostFocus = () => { if (draggingGizmo.current) rollbackGizmo(); };
    window.addEventListener("keydown", abort, true);
    window.addEventListener("blur", lostFocus);
    return () => {
      window.removeEventListener("keydown", abort, true);
      window.removeEventListener("blur", lostFocus);
    };
  }, [node]);

  const onHit = (event: ThreeEvent<PointerEvent>): {
    texel: Texel; face: string; textureId: string
  } | null => {
    const direction = faceFromTriangle(event.faceIndex ?? -1);
    if (node.material !== "texture" || !event.uv || !direction) return null;
    const textureId = node.faces[direction].textureId;
    const texture = props.textures.find(t => t.id === textureId);
    if (!texture) return null;
    return {
      texel: uvToTexel(event.uv.x, event.uv.y, texture.width, texture.height),
      face: node.id + ":" + direction, textureId
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
    if (tool === "eyedropper") { props.onSample(hit.texel, hit.textureId); return; }
    if (node.locked) return;
    if (tool === "fill") { props.onFill(hit.texel, hit.textureId); return; }
    if (tool !== "pencil" && tool !== "eraser") return;
    const capture = event.target as (EventTarget & { setPointerCapture?: (id: number) => void }) | null;
    capture?.setPointerCapture?.(event.pointerId);
    props.onBeginPaint(hit.texel, hit.face, hit.textureId);
  };
  const handleMove = (event: ThreeEvent<PointerEvent>) => {
    if (mode !== "paint" || (tool !== "pencil" && tool !== "eraser") ||
        (event.buttons & 1) === 0) return;
    const hit = onHit(event);
    if (hit) props.onContinuePaint(hit.texel, hit.face, hit.textureId);
  };
  const handleUp = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || mode !== "paint" ||
        (tool !== "pencil" && tool !== "eraser")) return;
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
        {BOX_FACE_ORDER.map((direction, index) => <meshStandardMaterial
          key={direction} attach={`material-${index}`}
          color={node.color}
          map={node.material === "texture" ? props.textureMaps[node.faces[direction].textureId] ?? null : null}
          transparent={node.material === "texture"} depthWrite={node.material !== "texture"}
          roughness={node.material === "solid" ? 0.48 : 0.95}
          metalness={node.material === "solid" ? 0.18 : 0}/>)}
        {isSelected && mode !== "preview" && <Edges color="#80dbbf" threshold={15} scale={1.004} />}
      </mesh>
      {isSelected && mode !== "preview" && <FaceHighlight node={node} face={props.selectedFace}/>}
    </group>
  );

  if (!activeGizmo) return mesh;

  return <TransformControls mode={activeGizmo === "move" ? "translate" : "scale"}
    translationSnap={props.snap / WORLD} scaleSnap={0.125} size={0.74}
    onMouseDown={() => {
      draggingGizmo.current = true;
      cancelledGizmo.current = false;
    }}
    onMouseUp={() => {
      const object = anchor.current;
      const shouldCommit = !!object && draggingGizmo.current && !cancelledGizmo.current;
      const position = object ? vec(object.position.toArray()) : null;
      const scale = object ? vec(object.scale.toArray()) : null;
      rollbackGizmo();
      if (shouldCommit && position && scale) props.onTransform(node.id, position, scale);
    }}>
    {mesh}
  </TransformControls>;
}

function Scene(props: ViewportProps) {
  const textureMaps = useTextureMaps(
    props.document.textures, props.pixels, props.draftTextureId, props.document.activeTextureId
  );
  return <>
    <color attach="background" args={["#141619"]} />
    <ambientLight intensity={1.35} />
    <directionalLight position={[3, 6, 4]} intensity={2.3} castShadow
      shadow-mapSize={[1024, 1024]} shadow-camera-near={0.1}
      shadow-camera-far={20} />
    <directionalLight position={[-3, 2, -4]} intensity={0.85} color="#a3c8be" />
    {props.mode !== "preview" && <gridHelper args={[10, 20, "#33483f", "#242c2b"]} position={[0, 0, 0]} />}
    {props.document.cuboids.filter((node) => node.visible).map((node) =>
      <AssetMesh key={node.id} {...props} node={node}
        textureMaps={textureMaps} textures={props.document.textures}/>)}
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
      {import.meta.env.DEV && typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).has("benchmark") &&
        <DevPerformanceProbe />}
    </Canvas>
  </div>;
}
