import { describe, expect, it } from "vitest";
import { createSampleDocument } from "./domain";
import { encodeProject } from "./project";
import { encodeNativeProject } from "./nativeArchive";
import { encodeNativePack } from "./nativePackArchive";
import { indexLegacyProject } from "../pack/packDocument";
import { makeJava1214Pack } from "../export/javaBlock";
import { prepareImport } from "./importPreparation";

describe("worker import codec boundary", () => {
  it("opens legacy JSON without changing the document", async () => {
    const document = createSampleDocument();
    const bytes = new TextEncoder().encode(encodeProject(document));
    const result = await prepareImport({ kind: "source", filename: "legacy.3dmc.json", bytes });
    expect(result).toEqual({ kind: "document", document });
  });

  it("keeps v2 native projects standalone in the main Open workflow", async () => {
    const document = createSampleDocument();
    const bytes = await encodeNativeProject(document);
    expect(await prepareImport({ kind: "source", filename: "lantern.3dmc", bytes }))
      .toEqual({ kind: "document", document });
    expect(await prepareImport({ kind: "single", bytes }))
      .toEqual({ kind: "document", document });
  });

  it("opens v3 pack archives as complete editable packs", async () => {
    const document = createSampleDocument();
    const pack = indexLegacyProject(document);
    const bytes = await encodeNativePack(pack, [document]);
    const result = await prepareImport({ kind: "source", filename: "models.3dmc", bytes });
    expect(result).toEqual({ kind: "pack", project: { pack, sources: [document] } });
    expect(await prepareImport({ kind: "pack", bytes }))
      .toEqual({ kind: "pack", project: { pack, sources: [document] } });
  });

  it("migrates legacy source projects only when opened through Pack Studio", async () => {
    const document = createSampleDocument();
    const result = await prepareImport({ kind: "pack", bytes: await encodeNativeProject(document) });
    expect(result.kind).toBe("pack");
    if (result.kind !== "pack") throw new Error("Missing source pack");
    expect(result.project.sources).toEqual([document]);
    expect(result.project.pack.models).toHaveLength(1);
  });

  it("inspects an editable Java ZIP without applying its document", async () => {
    const bytes = makeJava1214Pack(createSampleDocument()).zip;
    const result = await prepareImport({ kind: "java", bytes });
    expect(result.kind).toBe("java");
    if (result.kind !== "java") throw new Error("Missing Java report");
    expect(result.report.status).toBe("editable");
    if (result.report.status !== "editable") throw new Error("Fixture did not import");
    expect(result.report.paths).toContain("pack.mcmeta");
  });

  it("reports invalid Java archives as blocked and rejects malformed native files", async () => {
    const bytes = new TextEncoder().encode("This is not a ZIP");
    expect(await prepareImport({ kind: "java", bytes }))
      .toMatchObject({ kind: "java", report: { status: "blocked" } });
    await expect(prepareImport({ kind: "source", filename: "broken.3dmc", bytes }))
      .rejects.toThrow();
  });

  it("enforces archive budgets before decoding and refuses unsupported kinds", async () => {
    const tooLarge = new Uint8Array(2_000_001);
    await expect(prepareImport({ kind: "java", bytes: tooLarge }))
      .rejects.toThrow("2 MB");
    await expect(prepareImport({ kind: "single", bytes: new Uint8Array(3_000_001) }))
      .rejects.toThrow("3 MB");
    await expect(prepareImport({ kind: "other" as "pack", bytes: new Uint8Array() }))
      .rejects.toThrow("Unsupported import job");
  });
});
