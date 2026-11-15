import type { SymmetryMode } from "../editor/paintGeometry";

/** Half-texel axes are exact for odd and even dimensions. X is vertical;
 * Y is horizontal. The overlay is above pixels but never handles input. */
export function SymmetryGuides({ mode, width, height, zoom }: {
  mode: SymmetryMode; width: number; height: number; zoom: number;
}) {
  if (mode === "off") return null;
  const strokeWidth = 2 / zoom;
  const dash = (5 / zoom) + " " + (3 / zoom);
  return <svg aria-hidden="true" className="sheet-symmetry-guides"
    width={width * zoom} height={height * zoom}
    viewBox={"0 0 " + width + " " + height} preserveAspectRatio="none">
    {(mode === "x" || mode === "both") && <line x1={width / 2} y1={0}
      x2={width / 2} y2={height} stroke="#ffce80"
      strokeWidth={strokeWidth} strokeDasharray={dash}/>}
    {(mode === "y" || mode === "both") && <line x1={0} y1={height / 2}
      x2={width} y2={height / 2} stroke="#80dafa"
      strokeWidth={strokeWidth} strokeDasharray={dash}/>}
  </svg>;
}
