import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { decodeProject, encodeProject } from "./project";
import { createSampleDocument, setTexturePixels } from "./domain";
import { decodeNativeProject, encodeNativeProject, nativeFilename,
  NATIVE_FILES, NativeProjectError } from "./nativeArchive";
import { makeNewProject } from "./templates";

const sample = createSampleDocument;
const repack = (zip: Uint8Array, mutate: (files: Record<string, Uint8Array>) => void) => {
  const files = unzipSync(zip);
  mutate(files);
  return zipSync(files, { level: 0, mtime: new Date(1980, 0, 1) });
};

describe("native .3dmc source archives", () => {
  it("deterministically stores a manifest, document metadata and a separate RGBA PNG", async () => {
    const doc = sample();
    const a = await encodeNativeProject(doc);
    expect(a).toEqual(await encodeNativeProject(doc));
    const files = unzipSync(a);
    expect(Object.keys(files).sort()).toEqual([...NATIVE_FILES].sort());
    const manifest = JSON.parse(strFromU8(files["manifest.json"]!));
    expect(manifest).toMatchObject({
      format: "3dmc-native", containerVersion: 2,
      documentSchemaVersion: 3, document: "document.json",
      textures: ["textures/main.png"]
    });
    expect(manifest.sha256["document.json"]).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.sha256["textures/main.png"]).toMatch(/^[a-f0-9]{64}$/);
    const descriptor = JSON.parse(strFromU8(files["document.json"]!));
    expect(descriptor.textures[0]).toEqual({
      id: doc.textures[0]!.id, name: doc.textures[0]!.name,
      width: 32, height: 32, path: "textures/main.png"
    });
    expect(descriptor.textures[0].pixels).toBeUndefined();
    expect(await decodeNativeProject(a)).toEqual(doc);
    expect(a.byteLength).toBeLessThan(70_000);
  });

  it("preserves native-only names, hidden/locked parts, face UVs and transparency", async () => {
    const original = sample();
    const pixels = [...original.textures[0]!.pixels];
    pixels[3] = 0;
    pixels[16 * 4 + 3] = 128;
    const modified = setTexturePixels({
      ...original,
      cuboids: original.cuboids.map((node, i) => i === 0 ? {
        ...node, name: "Retain this label", visible: false, locked: true,
        faces: { ...node.faces, north: { uv: [2, 3, 14, 12] as const,
          rotation: 90 as const, textureId: "main" } }
      } : node)
    }, pixels);
    const again = await decodeNativeProject(await encodeNativeProject(modified));
    expect(again).toEqual(modified);
    expect(again.textures[0]!.pixels[3]).toBe(0);
    expect(again.textures[0]!.pixels[16 * 4 + 3]).toBe(128);
  });

  it("preserves a migrated v1 source after reopening in the new archive", async () => {
    const old = sample();
    const legacy = {
      ...old, schemaVersion: 1, texture: old.textures[0]!,
      cuboids: old.cuboids.map(({ faces: _faces, ...rest }) => rest)
    };
    const upgraded = decodeProject(JSON.stringify(legacy));
    expect(upgraded.schemaVersion).toBe(3);
    expect(await decodeNativeProject(await encodeNativeProject(upgraded))).toEqual(upgraded);
    expect(decodeProject(encodeProject(upgraded))).toEqual(upgraded);
  });

  it("never accepts damaged CRC, unknown paths, compressed archives or missing entries", async () => {
    const archive = await encodeNativeProject(sample());
    const changed = archive.slice();
    changed[75] = changed[75]! ^ 0xff;
    await expect(decodeNativeProject(changed)).rejects.toBeInstanceOf(NativeProjectError);
    await expect(decodeNativeProject(new Uint8Array(3_000_001))).rejects.toThrow(/3 MB/);

    const missing = repack(archive, (files) => { delete files["textures/main.png"]; });
    await expect(decodeNativeProject(missing)).rejects.toThrow(/missing|unknown|extra|unexpected|source files|archive/i);

    const unknown = repack(archive, (files) => { files["../outside.txt"] = strToU8("bad"); });
    await expect(decodeNativeProject(unknown)).rejects.toThrow(/missing|unknown|extra|unexpected|source files|archive/i);

    const compressed = zipSync(unzipSync(archive), { level: 6 });
    await expect(decodeNativeProject(compressed)).rejects.toThrow(/unsupported compression/);
  });

  it("detects a consistent ZIP whose JSON content was changed without updating SHA", async () => {
    const archive = await encodeNativeProject(sample());
    const modified = repack(archive, (files) => {
      const doc = JSON.parse(strFromU8(files["document.json"]!));
      doc.name = "Tampered";
      files["document.json"] = strToU8(JSON.stringify(doc));
    });
    await expect(decodeNativeProject(modified)).rejects.toThrow(/integrity/);
  });

  it("rejects a structurally valid archive with a different source format or unknown fields", async () => {
    const archive = await encodeNativeProject(sample());
    const modified = repack(archive, (files) => {
      const manifest = JSON.parse(strFromU8(files["manifest.json"]!));
      manifest.containerVersion = 23;
      files["manifest.json"] = strToU8(JSON.stringify(manifest));
    });
    await expect(decodeNativeProject(modified)).rejects.toThrow(/Unsupported native/);
  });


  it("retains all named textures and per-face IDs through native archive version 2", async () => {
    const first = createSampleDocument();
    const alternate = {
      id: "detail", name:"details.png", width: 16, height: 16,
      pixels: new Array<number>(16 * 16 * 4).fill(250)
    };
    const source = {
      ...first, textures: [...first.textures, alternate],
      cuboids: first.cuboids.map((node,i) => i === 0 ? {
        ...node, faces: { ...node.faces,
          north: { ...node.faces.north, textureId:"detail" },
          east: { ...node.faces.east, textureId:"detail", rotation: 90 as const }
        }
      } : node)
    };
    const bytes = await encodeNativeProject(source);
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toContain("textures/detail.png");
    const manifest = JSON.parse(strFromU8(files["manifest.json"]!));
    expect(manifest.containerVersion).toBe(2);
    expect(manifest.textures).toEqual(["textures/main.png","textures/detail.png"]);
    const decoded = await decodeNativeProject(bytes);
    expect(decoded).toEqual(source);
    expect(await encodeNativeProject(decoded)).toEqual(bytes);
    const damaged = repack(bytes, entries => {
      const image = entries["textures/detail.png"]!;
      image[20] = image[20]! ^ 1;
    });
    await expect(decodeNativeProject(damaged)).rejects.toThrow(/integrity|checksum/);
    const unexpected = repack(bytes, entries => { entries["textures/orphan.png"] = entries["textures/detail.png"]!; });
    await expect(decodeNativeProject(unexpected)).rejects.toThrow(/extra|unknown|missing/);
  });

  it("rejects dangling face-to-texture references on import", async () => {
    const doc = createSampleDocument();
    const wrong = { ...doc, cuboids: doc.cuboids.map((node,i) => i === 0
      ? { ...node, faces: { ...node.faces,
        north: { ...node.faces.north, textureId:"missing" } } } : node)
    };
    await expect(encodeNativeProject(wrong)).rejects.toThrow(/dangling/);
  });


  it("reads an authentic v1 container with its original v2 source and PNG bytes", async () => {
    const sample = createSampleDocument();
    const file = (value:unknown) => strToU8(JSON.stringify(value,null,2)+"\n");
    const png = (await import("../export/png")).encodeRgbaPng(
      sample.textures[0]!.width, sample.textures[0]!.height, sample.textures[0]!.pixels
    );
    const legacy = file({
      schemaVersion: 2, id: sample.id, name: sample.name, target: sample.target,
      cuboids: sample.cuboids.map(node => ({
        ...node,
        faces: Object.fromEntries(Object.entries(node.faces).map(([direction,binding]) => [
          direction, { uv: binding.uv, rotation: binding.rotation }
        ]))
      })),
      texture: {
        id:"main", name:sample.textures[0]!.name,
        width:sample.textures[0]!.width, height:sample.textures[0]!.height,
        path:"textures/main.png"
      }
    });
    const sha = async (bytes:Uint8Array) =>
      [...new Uint8Array(await crypto.subtle.digest("SHA-256",new Uint8Array(bytes).buffer))]
        .map(n=>n.toString(16).padStart(2,"0")).join("");
    const manifest = file({
      format:"3dmc-native",containerVersion:1,documentSchemaVersion:2,
      document:"document.json",texture:"textures/main.png",
      sha256:{ "document.json":await sha(legacy),"textures/main.png":await sha(png) }
    });
    const archive = zipSync({
      "manifest.json":manifest,"document.json":legacy,"textures/main.png":png
    },{level:0,mtime:new Date(1980,0,1)});
    const migrated = await decodeNativeProject(archive);
    expect(migrated).toEqual(sample);
    expect(migrated.schemaVersion).toBe(3);
    const currentArchive = await encodeNativeProject(migrated);
    expect(await decodeNativeProject(currentArchive)).toEqual(sample);
  });

  it("sanitizes portable filenames", () => {
    expect(nativeFilename("../Copper Lantern : main")).toBe("copper-lantern-main.3dmc");
    expect(nativeFilename("?!!")).toBe("untitled.3dmc");
  });
});

describe("starter project templates", () => {
  it("constructs a truly empty editable model", () => {
    const blank = makeNewProject({ template: "blank", name: "Fresh canvas", resolution: 16, id: "new-blank" });
    expect(blank.cuboids).toEqual([]);
    expect(blank.name).toBe("Fresh canvas");
    expect(blank.target.candidateRelease).toBe("1.21.4");
    expect(blank.textures[0]!.width).toBe(16);
    expect(blank.textures[0]!.pixels).toHaveLength(16 * 16 * 4);
  });

  it("creates a textured cube and retains the selected resolution", () => {
    const cube = makeNewProject({ template: "cube", name: "Custom Block", resolution: 64, id: "new-cube" });
    expect(cube.cuboids).toHaveLength(1);
    expect(cube.cuboids[0]?.material).toBe("texture");
    expect(cube.cuboids[0]?.from).toEqual([0, 0, 0]);
    expect(cube.cuboids[0]?.to).toEqual([16, 16, 16]);
    expect(cube.textures[0]!.width).toBe(64);
    expect(cube.textures[0]!.pixels.slice(0, 4)).toEqual([71, 124, 103, 255]);
  });

  it("clones built-in reference scenes with independent project identity", () => {
    const lantern = makeNewProject({ template: "lantern", name: "My lantern", resolution: 16, id: "new-lantern" });
    expect(lantern.cuboids).toHaveLength(7);
    expect(lantern.textures[0]!.width).toBe(32);
    expect(lantern.id).toBe("new-lantern");
    const diagnostic = makeNewProject({ template: "diagnostic", name: "UV tests", resolution: 16, id: "new-uv" });
    expect(diagnostic.cuboids).toHaveLength(1);
    expect(diagnostic.textures[0]!.width).toBe(64);
    expect(diagnostic.cuboids[0]?.faces.east.uv).toEqual([4, 0, 8, 4]);
  });

  it("blocks invalid names and unsupported template choices", () => {
    expect(() => makeNewProject({ template: "blank", name: "  ", resolution: 32 })).toThrow(/name/);
    expect(() => makeNewProject({ template: "bad" as "cube", name: "Good", resolution: 32 })).toThrow(/Unknown/);
  });
});
