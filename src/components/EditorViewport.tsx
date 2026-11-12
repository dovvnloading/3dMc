import { Component, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Edges, OrbitControls, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import type { Cuboid, EditorDocument, FaceDirection, Vec3, PixelTexture } from "../editor/domain";
import type { SelectionGesture, SelectionModifiers } from "../editor/selection";
import { SelectionTransform } from "./SelectionTransform";
import { applyFaceUvs, BOX_FACE_ORDER, faceFromTriangle } from "../editor/uv";
import { uvToTexel } from "../editor/pixels";
import type { Texel } from "../editor/pixels";

export type Mode = "model" | "paint" | "preview";
export type Tool = "select" | "move" | "resize" | "pencil" | "eraser" | "fill" | "eyedropper" | "line" | "rectangle";
export type ViewKind = "iso" | "front" | "right" | "top";
export type ViewRequest = { kind: ViewKind; count: number };

interface ViewportProps {
  document: EditorDocument;
  pixels: number[];
  draftTextureId: string | null;
  selectedId: string | null;
  selectedIds?: readonly string[];
  selectedFace: FaceDirection;
  mode: Mode;
  tool: Tool;
  view: ViewRequest;
  snap: number;
  painting: boolean;
  cancelToken: number;
  onSelect: (id: string | null, modifiers?: SelectionModifiers) => void;
  onSelectFace: (face: FaceDirection) => void;
  onBeginPaint: (texel: Texel, face: string, textureId: string) => void;
  onContinuePaint: (texel: Texel, face: string, textureId: string) => void;
  onFinishPaint: () => void;
  onCancelPaint: () => void;
  onSample: (texel: Texel, textureId: string) => void;
  onFill: (texel: Texel, textureId: string, faceKey?: string) => void;
  onTransform: (id: string, position: Vec3, scale: Vec3) => void;
  onBatchTransform?: (gesture: SelectionGesture, translation: Vec3, scale: Vec3) => void;
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
      iso: [2.9, 2.35, 3.2], front: [0, 0.65, 4], right: [4, 0.65, 0], top: [0, 4, 0.001]
    };
    camera.position.set(...positions[view.kind]);
    camera.lookAt(0, 0.58, 0); camera.updateProjectionMatrix(); invalidate();
  }, [camera, invalidate, view]);
  return <OrbitControls makeDefault enableDamping dampingFactor={0.095}
    target={[0, 0.58, 0]} minDistance={0.9} maxDistance={25} enablePan screenSpacePanning />;
}

function useTextureMaps(textures: PixelTexture[], draftPixels: number[],
  draftTextureId: string | null, activeTextureId: string): Record<string, THREE.CanvasTexture> {
  const { invalidate } = useThree();
  const signature = textures.map(t => t.id + ":" + t.width + "x" + t.height).join("|");
  const resources = useMemo(() => {
    const owned: Record<string, { canvas: HTMLCanvasElement; map: THREE.CanvasTexture; pixels?: number[] }> = Object.create(null);
    textures.forEach(t => {
      const canvas = globalThis.document.createElement("canvas");
      canvas.width = t.width; canvas.height = t.height;
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestFilter;
      map.wrapS = THREE.ClampToEdgeWrapping; map.wrapT = THREE.ClampToEdgeWrapping;
      owned[t.id] = { canvas, map };
    });
    return owned;
    // IDs and dimensions own the maps. Pixel changes do not allocate GPU maps.
  }, [signature]);
  useEffect(() => {
    textures.forEach(t => {
      const resource = resources[t.id];
      const source = t.id === (draftTextureId ?? activeTextureId) ? draftPixels : t.pixels;
      if (!resource || source === resource.pixels || source.length !== t.width * t.height * 4) return;
      const context = resource.canvas.getContext("2d");
      if (!context) return;
      context.putImageData(new ImageData(new Uint8ClampedArray(source), t.width, t.height), 0, 0);
      resource.pixels = source; resource.map.needsUpdate = true;
    });
    invalidate();
  }, [resources, textures, draftPixels, draftTextureId, activeTextureId, invalidate]);
  useEffect(() => () => Object.values(resources).forEach(r => r.map.dispose()), [resources]);
  return Object.fromEntries(Object.entries(resources).map(([id, r]) => [id, r.map]));
}

interface EditorDiagnostics {
  snapshot: () => {
    gpuTextures: number; gpuGeometries: number; drawCalls: number; triangles: number; renderedFrames: number;
    frameIntervalP50Ms: number | null; frameIntervalP95Ms: number | null; pixelRatio: number;
  };
  resetFrames: () => void;
}
type DiagnosticsWindow = Window & { __3dmcDiagnostics?: EditorDiagnostics };
function DevPerformanceProbe() {
  const { gl } = useThree();
  const samples = useRef<number[]>([]), frameCount = useRef(0), lastFrame = useRef<number | null>(null);
  useFrame(() => {
    const now = performance.now();
    if (lastFrame.current !== null) {
      const interval = now - lastFrame.current;
      if (interval > 0 && interval < 200) {
        samples.current.push(interval);
        if (samples.current.length > 200) samples.current.shift();
      }
    }
    lastFrame.current = now; frameCount.current += 1;
  });
  useEffect(() => {
    const target = window as DiagnosticsWindow;
    const percentile = (input: number[], percent: number) => input.length ?
      [...input].sort((a, b) => a - b)[Math.min(input.length - 1, Math.floor((input.length - 1) * percent))]! : null;
    const api: EditorDiagnostics = {
      snapshot: () => ({ gpuTextures: gl.info.memory.textures, gpuGeometries: gl.info.memory.geometries,
        drawCalls: gl.info.render.calls, triangles: gl.info.render.triangles, renderedFrames: frameCount.current,
        frameIntervalP50Ms: percentile(samples.current, .5), frameIntervalP95Ms: percentile(samples.current, .95),
        pixelRatio: gl.getPixelRatio() }),
      resetFrames: () => { samples.current = []; frameCount.current = 0; lastFrame.current = null; }
    };
    target.__3dmcDiagnostics = api;
    return () => { if (target.__3dmcDiagnostics === api) delete target.__3dmcDiagnostics; };
  }, [gl]);
  return null;
}

type MeshProps = Pick<ViewportProps, "selectedId" | "selectedIds" | "selectedFace" | "mode" | "tool" | "snap" | "painting" |
  "onSelect" | "onSelectFace" | "onBeginPaint" | "onContinuePaint" | "onFinishPaint" |
  "onCancelPaint" | "onSample" | "onFill" | "onTransform" | "cancelToken"> & {
    node: Cuboid; textureMaps: Record<string, THREE.Texture>; textures: PixelTexture[];
    groupOrigin?: Vec3; suppressGizmo?: boolean;
  };

function FaceHighlight({ node, face }: { node: Cuboid; face: FaceDirection }) {
  const [sx, sy, sz] = dimensions(node), epsilon = 0.0014;
  const placements: Record<FaceDirection, { position: Vec3; rotation: Vec3; size: readonly [number, number] }> = {
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
  const anchor = useRef<THREE.Group>(null!);
  const { invalidate } = useThree();
  const draggingGizmo = useRef(false), cancelledGizmo = useRef(false);
  const worldPosition = center(node);
  const initialPosition: Vec3 = props.groupOrigin ?
    [worldPosition[0] - props.groupOrigin[0], worldPosition[1] - props.groupOrigin[1], worldPosition[2] - props.groupOrigin[2]] : worldPosition;
  const geometry = useMemo(() => {
    const box = new THREE.BoxGeometry(...dimensions(node)); applyFaceUvs(box, node.faces); return box;
  }, [node.from, node.to, node.faces]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const isSelected = props.selectedIds?.includes(node.id) ?? selectedId === node.id;
  const activeGizmo = !props.suppressGizmo && isSelected && mode === "model" && !node.locked &&
    (tool === "move" || tool === "resize") ? tool : null;
  const rollbackGizmo = () => {
    cancelledGizmo.current = true; draggingGizmo.current = false;
    anchor.current?.position.set(...initialPosition); anchor.current?.scale.set(1, 1, 1); invalidate();
  };
  useEffect(() => { rollbackGizmo(); }, [props.cancelToken, activeGizmo, node, props.groupOrigin]);
  useEffect(() => {
    const abort = (event: KeyboardEvent) => { if (event.key === "Escape" && draggingGizmo.current) rollbackGizmo(); };
    const cancel = () => { if (draggingGizmo.current) rollbackGizmo(); };
    const lostCapture = () => queueMicrotask(cancel);
    window.addEventListener("keydown", abort, true); window.addEventListener("blur", cancel);
    window.addEventListener("pointercancel", cancel); window.addEventListener("lostpointercapture", lostCapture, true);
    return () => {
      window.removeEventListener("keydown", abort, true); window.removeEventListener("blur", cancel);
      window.removeEventListener("pointercancel", cancel); window.removeEventListener("lostpointercapture", lostCapture, true);
    };
  }, [node, props.groupOrigin]);

  const onHit = (event: ThreeEvent<PointerEvent>): { texel: Texel; face: string; textureId: string } | null => {
    const direction = faceFromTriangle(event.faceIndex ?? -1);
    if (node.material !== "texture" || !event.uv || !direction) return null;
    const textureId = node.faces[direction].textureId;
    const texture = props.textures.find(t => t.id === textureId);
    if (!texture) return null;
    return { texel: uvToTexel(event.uv.x, event.uv.y, texture.width, texture.height), face: node.id + ":" + direction, textureId };
  };
  const handleDown = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || mode !== "paint") return;
    const hit = onHit(event); if (!hit) return;
    event.stopPropagation(); props.onSelect(node.id);
    const direction = faceFromTriangle(event.faceIndex ?? -1); if (direction) props.onSelectFace(direction);
    if (tool === "eyedropper") { props.onSample(hit.texel, hit.textureId); return; }
    if (node.locked) return;
    if (tool === "fill") { props.onFill(hit.texel, hit.textureId, hit.face); return; }
    if (tool !== "pencil" && tool !== "eraser" && tool !== "line" && tool !== "rectangle") return;
    const capture = event.target as (EventTarget & { setPointerCapture?: (id: number) => void }) | null;
    capture?.setPointerCapture?.(event.pointerId); props.onBeginPaint(hit.texel, hit.face, hit.textureId);
  };
  const handleMove = (event: ThreeEvent<PointerEvent>) => {
    if (mode !== "paint" || !["pencil", "eraser", "line", "rectangle"].includes(tool) ||
        (event.buttons & 1) === 0) return;
    const hit = onHit(event); if (hit) props.onContinuePaint(hit.texel, hit.face, hit.textureId);
  };
  const handleUp = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || mode !== "paint" || !["pencil", "eraser", "line", "rectangle"].includes(tool)) return;
    event.stopPropagation();
    const hit = onHit(event);
    if (hit) props.onContinuePaint(hit.texel, hit.face, hit.textureId);
    props.onFinishPaint();
    const capture = event.target as (EventTarget & {
      hasPointerCapture?: (id: number) => boolean; releasePointerCapture?: (id: number) => void;
    }) | null;
    if (capture?.hasPointerCapture?.(event.pointerId)) capture.releasePointerCapture?.(event.pointerId);
  };
  const mesh = <group ref={anchor} position={initialPosition}>
    <mesh castShadow receiveShadow onClick={event => {
      event.stopPropagation();
      if (mode === "model" && event.delta <= 4) {
        props.onSelect(node.id, { toggle: event.ctrlKey || event.metaKey || event.shiftKey });
        const face = faceFromTriangle(event.faceIndex ?? -1); if (face) props.onSelectFace(face);
      }
    }} onPointerDown={handleDown} onPointerMove={handleMove} onPointerUp={handleUp}
      onPointerCancel={() => props.onCancelPaint()}>
      <primitive object={geometry} attach="geometry" />
      {BOX_FACE_ORDER.map((direction, index) => <meshStandardMaterial key={direction} attach={`material-${index}`}
        color={node.color} map={node.material === "texture" ? props.textureMaps[node.faces[direction].textureId] ?? null : null}
        transparent={node.material === "texture"} depthWrite={node.material !== "texture"}
        roughness={node.material === "solid" ? 0.48 : 0.95} metalness={node.material === "solid" ? 0.18 : 0}/>)}
      {isSelected && mode !== "preview" && <Edges color="#80dbbf" threshold={15} scale={1.004} />}
    </mesh>
    {selectedId === node.id && mode !== "preview" && <FaceHighlight node={node} face={props.selectedFace}/>}
  </group>;
  if (!activeGizmo) return mesh;
  return <TransformControls object={anchor} mode={activeGizmo === "move" ? "translate" : "scale"}
    translationSnap={props.snap / WORLD} scaleSnap={0.125} size={0.74}
    onMouseDown={() => { draggingGizmo.current = true; cancelledGizmo.current = false; }}
    onMouseUp={() => {
      const object = anchor.current;
      const shouldCommit = !!object && draggingGizmo.current && !cancelledGizmo.current;
      const position = object ? vec(object.position.toArray()) : null, scale = object ? vec(object.scale.toArray()) : null;
      rollbackGizmo(); if (shouldCommit && position && scale) props.onTransform(node.id, position, scale);
    }}>{mesh}</TransformControls>;
}

function Scene(props: ViewportProps) {
  const textureMaps = useTextureMaps(props.document.textures, props.pixels, props.draftTextureId, props.document.activeTextureId);
  const ids = props.selectedIds ?? (props.selectedId ? [props.selectedId] : []);
  const selected = new Set(ids), multiple = ids.length > 1;
  const members = props.document.cuboids.filter(node => selected.has(node.id));
  const grouped = multiple && members.length === ids.length && members.every(node => node.visible && !node.locked);
  const renderNode = (node: Cuboid, groupOrigin?: Vec3) => <AssetMesh key={node.id} {...props}
    selectedIds={ids} node={node} textureMaps={textureMaps} textures={props.document.textures}
    suppressGizmo={multiple} groupOrigin={groupOrigin}/>;
  return <>
    <color attach="background" args={["#141619"]}/>
    <ambientLight intensity={1.35}/>
    <directionalLight position={[3, 6, 4]} intensity={2.3} castShadow shadow-mapSize={[1024, 1024]}
      shadow-camera-near={0.1} shadow-camera-far={20}/>
    <directionalLight position={[-3, 2, -4]} intensity={0.85} color="#a3c8be"/>
    {props.mode !== "preview" && <gridHelper args={[10, 20, "#33483f", "#242c2b"]} position={[0, 0, 0]}/>}
    {props.document.cuboids.filter(node => node.visible && (!grouped || !selected.has(node.id))).map(node => renderNode(node))}
    {grouped && <SelectionTransform document={props.document} ids={ids} snap={props.snap} cancelToken={props.cancelToken}
      active={props.mode === "model" && props.onBatchTransform && (props.tool === "move" || props.tool === "resize") ? props.tool : null}
      onCommit={(gesture, delta, scale) => props.onBatchTransform?.(gesture, delta, scale)}>
      {origin => members.map(node => renderNode(node, origin))}
    </SelectionTransform>}
    <CameraControls view={props.view}/>
  </>;
}

/**
 * A failed GPU must never replace the canonical document workspace with the
 * global startup error screen. Preserve numeric/model controls, 2D painting,
 * recovery and source downloads when a browser disallows WebGL2.
 */
class ViewportFailureBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  componentDidCatch(error: Error): void {
    console.error("3dMc 3D viewport unavailable; the editor document remains intact", error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="webgl-fallback" role="status" aria-label="3D preview unavailable">
      <strong>3D rendering is unavailable in this browser session.</strong>
      <p>The Scene, numeric inspector, 2D Paint tools, local recovery and portable source downloads remain available.
        No project geometry or texture pixels were changed by the graphics failure.</p>
      <button type="button" onClick={() => this.setState({ failed: false })}>Retry 3D rendering</button>
    </div>;
  }
}

export function EditorViewport(props: ViewportProps) {
  return <div className={"viewport-canvas viewport-" + props.mode}>
    <ViewportFailureBoundary>
      <Canvas camera={{ position: [2.9, 2.35, 3.2], fov: 40, near: 0.01, far: 100 }}
      frameloop="demand" shadows="percentage" dpr={[1, 2]} gl={{ antialias: true, powerPreference: "high-performance" }}
      fallback={<div className="webgl-fallback">3D rendering is unavailable. Your project remains editable through the Scene and Inspector.</div>}
      onPointerMissed={event => {
        if (props.mode === "model" && props.tool === "select" && !event.ctrlKey && !event.metaKey && !event.shiftKey) props.onSelect(null);
      }}>
      <Scene {...props}/>
      {import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("benchmark") && <DevPerformanceProbe/>}
      </Canvas>
    </ViewportFailureBoundary>
  </div>;
}
