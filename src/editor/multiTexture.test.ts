import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import {
  activeTexture, addTexture, affectedFaces, assignFaceTexture,
  createSampleDocument, parseDocument, removeTexture,
  renameTexture, selectTexture, setTexturePixels
} from "./domain";
import { commit, createHistory, undo, redo } from "./history";
import { decodeNativeProject, encodeNativeProject } from "./nativeArchive";
import { makeJava1214Pack, JAVA_PACK_PATHS } from "../export/javaBlock";
import { inspectJava1214Pack } from "../import/javaPack";

const detail = () => ({
  id:"secondary", name:"details.png", width:16, height:16,
  pixels:Array.from({length:16*16},(_,i) =>
    [i%256, (i*3)%256, (i*7)%256, 255]).flat()
});

describe("multi-texture authored document", () => {
  it("migrates v2 JSON with all faces mapped to the original main source", () => {
    const current = createSampleDocument();
    const old = {
      ...current,
      schemaVersion:2,
      texture: current.textures[0],
      cuboids: current.cuboids.map(node => ({ ...node,
        faces:Object.fromEntries(Object.entries(node.faces).map(([face,binding]) =>
          [face, {uv:binding.uv,rotation:binding.rotation}])) }))
    };
    const migrated = parseDocument(old);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.textures).toEqual(current.textures);
    expect(migrated.activeTextureId).toBe("main");
    expect(migrated.cuboids).toEqual(current.cuboids);
    expect(old.cuboids[0]!.faces.north).not.toHaveProperty("textureId");
  });

  it("assigns a different face without affecting another or resetting authored UV", () => {
    const source = createSampleDocument();
    const extended = addTexture(source, detail());
    const uv = extended.cuboids[0]!.faces.north.uv;
    const assigned = assignFaceTexture(extended, "body", "north", "secondary");
    expect(assigned.cuboids[0]?.faces.north).toEqual({
      uv, rotation:0, textureId:"secondary"
    });
    expect(assigned.cuboids[0]?.faces.south.textureId).toBe("main");
    expect(affectedFaces(assigned, "secondary")).toEqual([
      {nodeId:"body",name:"Lantern body",face:"north"}
    ]);
    expect(assignFaceTexture(assigned,"body","south","unknown")).toBe(assigned);
    expect(source.textures).toHaveLength(1);
  });

  it("paints one texture without changing even one pixel of another", () => {
    const original = createSampleDocument();
    const both = addTexture(original, detail());
    const nextPixels = [...detail().pixels];
    nextPixels[0] = 253;
    const painted = setTexturePixels(both, nextPixels, "secondary");
    expect(painted.textures[0]?.pixels).toEqual(original.textures[0]?.pixels);
    expect(painted.textures[1]?.pixels[0]).toBe(253);
    expect(activeTexture(painted).id).toBe("secondary");
    expect(selectTexture(painted, "main").textures).toEqual(painted.textures);
  });

  it("renames and removes an image with explicit atomic face remapping and exact undo", () => {
    const source = createSampleDocument();
    let history = createHistory(source);
    history = commit(history, addTexture(source, detail()));
    history = commit(history, assignFaceTexture(history.present,"body","north","secondary"));
    history = commit(history, renameTexture(history.present,"secondary","New details.png"));
    const before = history.present;
    const removed = removeTexture(before, "secondary", "main");
    history = commit(history, removed);
    expect(history.present.textures).toHaveLength(1);
    expect(history.present.cuboids[0]?.faces.north.textureId).toBe("main");
    expect(parseDocument(history.present)).toEqual(history.present);
    expect(undo(history).present).toEqual(before);
    expect(redo(undo(history)).present).toEqual(removed);
    expect(removeTexture(source,"main","main")).toBe(source);
    expect(removeTexture(before,"secondary","missing")).toBe(before);
  });

  it("rejects invalid texture IDs, duplicate textures, orphaned faces and unknown v3 fields", () => {
    const source = createSampleDocument();
    const duplicate = { ...source, textures:[...source.textures,source.textures[0]!] };
    expect(() => parseDocument(duplicate)).toThrow(/duplicated/i);
    const dangling = { ...source, cuboids:source.cuboids.map((n,i)=>i===0?{
      ...n,faces:{...n.faces,north:{...n.faces.north,textureId:"deleted"}}
    }:n) };
    expect(() => parseDocument(dangling)).toThrow(/dangling/i);
    expect(() => parseDocument({...source,originalMystery:{secret:1}})).toThrow(/metadata/);
  });

  it("persists 2 textures and face assignments through native and Java round-trips", async () => {
    let doc = addTexture(createSampleDocument(),detail());
    doc = assignFaceTexture(doc,"body","north","secondary");
    doc = assignFaceTexture(doc,"body","east","secondary");
    const native = await encodeNativeProject(doc);
    const imported = await decodeNativeProject(native);
    expect(imported).toEqual(doc);
    expect(await encodeNativeProject(imported)).toEqual(native);

    const pack = makeJava1214Pack(doc);
    const files = unzipSync(pack.zip);
    expect(files["assets/3dmc/textures/block/tex_1.png"]).toBeDefined();
    const model = JSON.parse(strFromU8(files[JAVA_PACK_PATHS.model]!));
    expect(model.textures.painted_1).toBe("3dmc:block/tex_1");
    expect(model.elements[0].faces.north.texture).toBe("#painted_1");
    expect(model.elements[0].faces.south.texture).toBe("#painted");
    const roundtrip = inspectJava1214Pack(pack.zip);
    expect(roundtrip.status).toBe("editable");
    if (roundtrip.status !== "editable") throw new Error(roundtrip.problems.join("; "));
    expect(roundtrip.document.cuboids[0]?.faces.north.textureId).toBe("texture_1");
    expect(roundtrip.document.textures[1]?.pixels).toEqual(detail().pixels);
    expect(makeJava1214Pack(roundtrip.document).zip).toEqual(pack.zip);
  });

  it("handles sixteen sheets with bounded total pixel memory", async () => {
    let doc = createSampleDocument();
    const now = Date.now();
    for (let i=1;i<16;i++) {
      const t = detail();
      doc = addTexture(doc,{...t,id:"t_"+i});
    }
    expect(doc.textures).toHaveLength(16);
    expect(addTexture(doc,{...detail(),id:"over"})).toBe(doc);
    expect(doc.textures.reduce((n,t)=>n+t.pixels.length,0)).toBe(4096+15*1024);
    const archive = await encodeNativeProject(doc);
    const restored = await decodeNativeProject(archive);
    expect(restored.textures).toHaveLength(16);
    expect(restored).toEqual(doc);
    expect(Date.now()-now).toBeLessThan(10000);
  });
});
