import { Component, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Edges, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import type { Cuboid, EditorDocument, FaceDirection, Vec3, PixelTexture } from "../editor/domain";
import type { SelectionGesture, SelectionModifiers } from "../editor/selection";
import { SelectionTransform } from "./SelectionTransform";
import { RotationHandle } from "./RotationHandle";
import { defaultElementRotation, elementCenter, elementRescale } from "../editor/elementRotation";
import type { ElementAngle } from "../editor/elementRotation";
import { applyFaceUvs, BOX_FACE_ORDER, faceFromTriangle } from "../editor/uv";
import { uvToTexel } from "../editor/pixels";
import type { Texel } from "../editor/pixels";
import type { PaintModifiers } from "../editor/paintGeometry";
import { CameraControls } from "./CameraControls";
import { ViewportAxes } from "./ViewportAxes";
import { calculateFrameBounds } from "../editor/frameSelection";
import type { ViewportDisplay } from "../editor/viewportProjection";
import { ViewportContextTarget } from "./ViewportContextTarget";

export type Mode = "model" | "paint" | "preview";
export type Tool = "select" | "move" | "resize" | "rotate" | "pencil" | "eraser" | "fill" | "eyedropper" | "line" | "rectangle" | "ellipse";
export type ViewKind = "iso" | "front" | "right" | "top";
export type ViewRequest = { kind: ViewKind | "frame" | "frame-all"; count: number };

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
  display: ViewportDisplay;
  snap: number;
  painting: boolean;
  cancelToken: number;
  onSelect: (id: string | null, modifiers?: SelectionModifiers) => void;
  onContextMenu: (id: string | null, x: number, y: number, canvas: HTMLCanvasElement) => void;
  onSelectFace: (face: FaceDirection) => void;
  onBeginPaint: (texel: Texel, face: string, textureId: string, modifiers?: PaintModifiers) => void;
  onContinuePaint: (texel: Texel, face: string, textureId: string, modifiers?: PaintModifiers) => void;
  onFinishPaint: () => void;
  onCancelPaint: () => void;
  onSample: (texel: Texel, textureId: string) => void;
  onFill: (texel: Texel, textureId: string, faceKey?: string) => void;
  onTransform: (id: string, position: Vec3, scale: Vec3) => void;
  onRotate: (id: string, angle: ElementAngle) => void;
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
  "onCancelPaint" | "onSample" | "onFill" | "onTransform" | "onRotate" | "cancelToken" | "display"> & {
    node: Cuboid; textureMaps: Record<string, THREE.Texture>; textures: PixelTexture[];
    opaqueTextureIds: ReadonlySet<string>;
    rotationEnabled: boolean;
    groupOrigin?: Vec3; suppressGizmo?: boolean; groupOutline?: boolean;
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
  const [previewAngle, setPreviewAngle] = useState<ElementAngle | null>(null);
  const worldPosition = center(node);
  const initialPosition: Vec3 = props.groupOrigin ?
    [worldPosition[0] - props.groupOrigin[0], worldPosition[1] - props.groupOrigin[1], worldPosition[2] - props.groupOrigin[2]] : worldPosition;
  const geometry = useMemo(() => {
    const box = new THREE.BoxGeometry(...dimensions(node)); applyFaceUvs(box, node.faces); return box;
  }, [node.from, node.to, node.faces]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // Most furniture parts use one material on all six independently UV-mapped
  // faces. A single material avoids six draw calls for each small cuboid.
  const firstTextureId = node.faces[BOX_FACE_ORDER[0]].textureId;
  const sharedTexture = node.material === "texture" &&
    BOX_FACE_ORDER.every(direction => node.faces[direction].textureId === firstTextureId);
  const sharedOpaque = node.material === "solid" ||
    (sharedTexture && props.opaqueTextureIds.has(firstTextureId));
  const isSelected = props.selectedIds?.includes(node.id) ?? selectedId === node.id;
  const activeRotation = node.rotation ?? defaultElementRotation(node);
  const renderedRotation = previewAngle === null ? activeRotation : { ...activeRotation, angle: previewAngle };
  const angle = renderedRotation.angle * Math.PI / 180;
  const rotationEuler: Vec3 = renderedRotation.axis === "x" ? [angle, 0, 0] :
    renderedRotation.axis === "y" ? [0, angle, 0] : [0, 0, angle];
  const pivotPosition = renderedRotation.origin;
  const pivotDelta: Vec3 = pivotPosition.map((value, axis) =>
    (value - elementCenter(node)[axis]!) / WORLD) as [number, number, number];
  const unpivot: Vec3 = pivotDelta.map(value => -value) as [number, number, number];
  const scale = elementRescale(renderedRotation);
  const pivotWorld: Vec3 = [(pivotPosition[0] - 8) / WORLD,
    pivotPosition[1] / WORLD, (pivotPosition[2] - 8) / WORLD];
  const activeRotate = !props.suppressGizmo && isSelected && mode === "model" &&
    tool === "rotate" && props.rotationEnabled && !node.locked && node.visible;
  // A world-axis scale of an angled box introduces shear, unsupported by Java.
  // Numeric size changes instead scale the *unrotated* local bounds and pivot.
  const activeGizmo = !props.suppressGizmo && isSelected && mode === "model" && !node.locked &&
    (tool === "move" || (tool === "resize" && !node.rotation)) ? tool : null;
  const rollbackGizmo = () => {
    cancelledGizmo.current = true; draggingGizmo.current = false;
    anchor.current?.position.set(...initialPosition); anchor.current?.scale.set(1, 1, 1); invalidate();
  };
  useEffect(() => { rollbackGizmo(); setPreviewAngle(null); }, [props.cancelToken, activeGizmo, node, props.groupOrigin]);
  useEffect(() => {
    if (!activeGizmo) return;
    const abort = (event: KeyboardEvent) => { if (event.key === "Escape" && draggingGizmo.current) rollbackGizmo(); };
    const cancel = () => { if (draggingGizmo.current) rollbackGizmo(); };
    const lostCapture = () => queueMicrotask(cancel);
    window.addEventListener("keydown", abort, true); window.addEventListener("blur", cancel);
    window.addEventListener("pointercancel", cancel); window.addEventListener("lostpointercapture", lostCapture, true);
    return () => {
      window.removeEventListener("keydown", abort, true); window.removeEventListener("blur", cancel);
      window.removeEventListener("pointercancel", cancel); window.removeEventListener("lostpointercapture", lostCapture, true);
    };
  }, [activeGizmo, node, props.groupOrigin]);

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
    if (tool !== "pencil" && tool !== "eraser" && tool !== "line" && tool !== "rectangle" && tool !== "ellipse") return;
    const capture = event.target as (EventTarget & { setPointerCapture?: (id: number) => void }) | null;
    capture?.setPointerCapture?.(event.pointerId); props.onBeginPaint(hit.texel, hit.face, hit.textureId,
      { shiftKey: event.shiftKey, altKey: event.altKey });
  };
  const handleMove = (event: ThreeEvent<PointerEvent>) => {
    if (mode !== "paint" || !["pencil", "eraser", "line", "rectangle", "ellipse"].includes(tool) ||
        (event.buttons & 1) === 0) return;
    const hit = onHit(event); if (hit) props.onContinuePaint(hit.texel, hit.face, hit.textureId,
      { shiftKey: event.shiftKey, altKey: event.altKey });
  };
  const handleUp = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || mode !== "paint" || !["pencil", "eraser", "line", "rectangle", "ellipse"].includes(tool)) return;
    event.stopPropagation();
    const hit = onHit(event);
    if (hit) props.onContinuePaint(hit.texel, hit.face, hit.textureId,
      { shiftKey: event.shiftKey, altKey: event.altKey });
    props.onFinishPaint();
    const capture = event.target as (EventTarget & {
      hasPointerCapture?: (id: number) => boolean; releasePointerCapture?: (id: number) => void;
    }) | null;
    if (capture?.hasPointerCapture?.(event.pointerId)) capture.releasePointerCapture?.(event.pointerId);
  };
  const mesh = <group ref={anchor} position={initialPosition}>
    <group position={pivotDelta}><group rotation={rotationEuler} scale={scale}><group position={unpivot}>
    <mesh castShadow receiveShadow userData={{ contextElementId: node.id }} onClick={event => {
      if (event.button !== 0) return;
      event.stopPropagation();
      if (mode === "model" && event.delta <= 4) {
        props.onSelect(node.id, { toggle: event.ctrlKey || event.metaKey || event.shiftKey });
        const face = faceFromTriangle(event.faceIndex ?? -1); if (face) props.onSelectFace(face);
      }
    }} onPointerDown={handleDown} onPointerMove={handleMove} onPointerUp={handleUp}
      onPointerCancel={() => props.onCancelPaint()}>
      <primitive object={geometry} attach="geometry" />
      {node.material === "solid" || sharedTexture ?
        <meshStandardMaterial color={node.color}
          map={sharedTexture ? props.textureMaps[firstTextureId] ?? null : null}
          transparent={!sharedOpaque} depthWrite={sharedOpaque}
          roughness={node.material === "solid" ? 0.48 : 0.95}
          metalness={node.material === "solid" ? 0.18 : 0}/> :
        BOX_FACE_ORDER.map((direction, index) => <meshStandardMaterial
          key={direction} attach={`material-${index}`} color={node.color}
          map={props.textureMaps[node.faces[direction].textureId] ?? null}
          transparent={!props.opaqueTextureIds.has(node.faces[direction].textureId)}
          depthWrite={props.opaqueTextureIds.has(node.faces[direction].textureId)}
          roughness={0.95} metalness={0}/> )}
      {isSelected && props.display.outline && !props.groupOutline && <Edges color="#80dbbf" threshold={15} scale={1.004} />}
    </mesh>
    {selectedId === node.id && !props.groupOutline && mode !== "preview" && <FaceHighlight node={node} face={props.selectedFace}/>}
    </group></group></group>
    {isSelected && mode === "model" && !props.groupOutline && <group position={pivotDelta}>
      <mesh raycast={() => null} renderOrder={10}>
        <sphereGeometry args={[0.047, 12, 10]}/>
        <meshBasicMaterial color="#f0f2f6" depthTest={false} depthWrite={false}/>
      </mesh>
      <mesh raycast={() => null} renderOrder={10}>
        <sphereGeometry args={[0.024, 10, 8]}/>
        <meshBasicMaterial color="#141619" depthTest={false} depthWrite={false}/>
      </mesh>
    </group>}
    {activeRotate && <RotationHandle axis={activeRotation.axis} angle={activeRotation.angle}
      position={pivotDelta} worldPivot={pivotWorld}
      radius={Math.max(0.35, ...dimensions(node).map(value => value / 2 + 0.08))}
      cancelToken={props.cancelToken} onPreview={setPreviewAngle}
      onCommit={value => props.onRotate(node.id, value)}/>}
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
  const axesBounds = useMemo(() => calculateFrameBounds(props.document, []), [props.document.cuboids]);
  const textureMaps = useTextureMaps(props.document.textures, props.pixels, props.draftTextureId, props.document.activeTextureId);
  // Opaque painted sheets must write depth. The old transparent pass rendered
  // distant corks, bottle faces and drawer labels THROUGH nearer solid wood.
  // Test the current paint draft too, so erasing into alpha stays supported.
  const opaqueTextureIds = useMemo(() => {
    const draftId = props.draftTextureId ?? props.document.activeTextureId;
    return new Set(props.document.textures.filter(texture => {
      const pixels = texture.id === draftId ? props.pixels : texture.pixels;
      return pixels.length === texture.width * texture.height * 4 &&
        pixels.every((value, i) => i % 4 !== 3 || value === 255);
    }).map(texture => texture.id));
  }, [props.document.textures, props.document.activeTextureId,
    props.draftTextureId, props.pixels]);
  const ids = props.selectedIds ?? (props.selectedId ? [props.selectedId] : []);
  const selected = new Set(ids), multiple = ids.length > 1;
  const members = props.document.cuboids.filter(node => selected.has(node.id));
  const grouped = multiple && members.length === ids.length && members.every(node => node.visible && !node.locked);
  const groupOutline = grouped && members.every(node => !node.rotation) &&
    props.mode === "model" && !!props.document.groups?.some(group =>
    group.memberIds.length === selected.size && group.memberIds.every(id => selected.has(id)));
  const renderNode = (node: Cuboid, groupOrigin?: Vec3) => <AssetMesh key={node.id} {...props}
    selectedIds={ids} node={node} textureMaps={textureMaps} textures={props.document.textures}
    opaqueTextureIds={opaqueTextureIds} rotationEnabled={props.document.target.candidateRelease === "1.21.4"}
    suppressGizmo={multiple} groupOrigin={groupOrigin} groupOutline={groupOutline}/>;
  return <>
    <color attach="background" args={["#141619"]}/>
    <ambientLight intensity={1.35}/>
    <directionalLight position={[3, 6, 4]} intensity={2.3} castShadow shadow-mapSize={[1024, 1024]}
      shadow-camera-near={0.1} shadow-camera-far={20}/>
    <directionalLight position={[-3, 2, -4]} intensity={0.85} color="#a3c8be"/>
    {props.display.grid && <gridHelper args={[10, 20, "#33483f", "#242c2b"]} position={[0, 0, 0]} raycast={() => {}}/>}
    {props.display.axes && <ViewportAxes bounds={axesBounds}/>}
    {props.document.cuboids.filter(node => node.visible && (!grouped || !selected.has(node.id))).map(node => renderNode(node))}
    {grouped && <SelectionTransform document={props.document} ids={ids} snap={props.snap} cancelToken={props.cancelToken}
      outline={groupOutline && props.display.outline}
      active={props.mode === "model" && props.onBatchTransform &&
        (props.tool === "move" || (props.tool === "resize" && members.every(node => !node.rotation))) ? props.tool : null}
      onCommit={(gesture, delta, scale) => props.onBatchTransform?.(gesture, delta, scale)}>
      {origin => members.map(node => renderNode(node, origin))}
    </SelectionTransform>}
    <CameraControls view={props.view} projection={props.display.projection} document={props.document} selectedIds={ids}/>
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
        if (event.button === 0 && props.mode === "model" && props.tool === "select" &&
            !event.ctrlKey && !event.metaKey && !event.shiftKey) props.onSelect(null);
      }}>
      <Scene {...props}/>
      <ViewportContextTarget onOpen={props.onContextMenu}/>
      {import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("benchmark") && <DevPerformanceProbe/>}
      </Canvas>
    </ViewportFailureBoundary>
  </div>;
}
