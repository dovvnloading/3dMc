import { useCallback, useState } from "react";
import { nextSymmetry } from "./paintGeometry";
import type { SymmetryMode } from "./paintGeometry";

/** Paint options are local view state, isolated per sheet and project session.
 * They do not change a portable project or introduce empty undo entries. */
export function useTextureSymmetry(session: number, textureId: string) {
  const [modes, setModes] = useState<Record<string, SymmetryMode>>({});
  const key = session + ":" + textureId;
  const symmetry: SymmetryMode = modes[key] ?? "off";
  const setSymmetry = useCallback((mode: SymmetryMode) =>
    setModes(current => ({ ...current, [key]: mode })), [key]);
  const cycleSymmetry = useCallback(() =>
    setModes(current => ({ ...current, [key]: nextSymmetry(current[key] ?? "off") })), [key]);
  return { symmetry, setSymmetry, cycleSymmetry };
}
