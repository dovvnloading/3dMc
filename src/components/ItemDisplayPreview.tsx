import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { Cuboid, EditorDocument } from "../editor/domain";
import type { ItemDisplayTransform } from "../pack/itemProfile";
import { applyFaceUvs, BOX_FACE_ORDER } from "../editor/uv";

function PreviewPart({ part, maps }: {
  part: Cuboid; maps: Record<string, THREE.CanvasTexture>;
}) {
  const geometry = useMemo(() => {
    const box = new THREE.BoxGeometry(
      (part.to[0] - part.from[0]) / 16,
      (part.to[1] - part.from[1]) / 16,
      (part.to[2] - part.from[2]) / 16
    );
    applyFaceUvs(box, part.faces);
    return box;
  }, [part.from, part.to, part.faces]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} position={[
    (part.to[0] + part.from[0] - 16) / 32,
    (part.to[1] + part.from[1] - 16) / 32,
    (part.to[2] + part.from[2] - 16) / 32
  ]}>
    {BOX_FACE_ORDER.map((face, index) =>
      <meshStandardMaterial key={face} attach={`material-${index}`}
        color={part.material === "solid" ? part.color : "#ffffff"}
        map={part.material === "texture" ? maps[part.faces[face].textureId] ?? null : null}
        transparent={part.material === "texture"}
        roughness={0.9} metalness={0.05}/>)}
  </mesh>;
}

function PreviewItem({ document, display }: {
  document: EditorDocument; display: ItemDisplayTransform;
}) {
  // The preview uses the same geometry UV baking as the editor and exporter.
  // All texture/GPU resources are owned by this temporary Canvas.
  const maps = useMemo(() => {
    const result: Record<string, THREE.CanvasTexture> = Object.create(null);
    for (const source of document.textures) {
      const canvas = globalThis.document.createElement("canvas");
      canvas.width = source.width;
      canvas.height = source.height;
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.putImageData(new ImageData(new Uint8ClampedArray(source.pixels),
        source.width, source.height), 0, 0);
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      map.magFilter = THREE.NearestFilter;
      map.minFilter = THREE.NearestFilter;
      map.wrapS = THREE.ClampToEdgeWrapping;
      map.wrapT = THREE.ClampToEdgeWrapping;
      result[source.id] = map;
    }
    return result;
  }, [document.textures]);
  useEffect(() => () => Object.values(maps).forEach(map => map.dispose()), [maps]);
  const deg = Math.PI / 180;
  return <>
    <color attach="background" args={["#171d20"]}/>
    <ambientLight intensity={1.7}/>
    <directionalLight position={[2, 4, 5]} intensity={2.2}/>
    <directionalLight position={[-3, 1, -2]} intensity={0.8} color="#a6c4d5"/>
    <group position={display.translation.map(n => n / 16) as [number, number, number]}
      rotation={display.rotation.map(n => n * deg) as [number, number, number]}
      scale={display.scale}>
      {document.cuboids.map(part => <PreviewPart key={part.id} part={part} maps={maps}/>)}
    </group>
    <OrbitControls enablePan={false} minDistance={1.5} maxDistance={7}/>
  </>;
}

/** Approximate Java display transform viewer; no claims of game renderer parity. */
export function ItemDisplayPreview({ document, display }: {
  document: EditorDocument; display: ItemDisplayTransform;
}) {
  return <div className="pack-item-preview" role="group" aria-label="Item display preview">
    <Canvas camera={{ position: [2.2, 1.7, 2.7], fov: 38, near: 0.02, far: 50 }}
      frameloop="demand" dpr={[1, 2]}
      fallback={<div className="pack-item-preview-fallback">3D preview unavailable; numeric item display controls remain editable.</div>}>
      <PreviewItem document={document} display={display}/>
    </Canvas>
  </div>;
}
