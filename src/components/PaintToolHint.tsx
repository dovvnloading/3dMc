import type { Tool } from "./EditorViewport";

export function PaintToolHint({ tool, filled, detail = false }: {
  tool: Tool; filled: boolean; detail?: boolean;
}) {
  const shape = tool === "rectangle" || tool === "ellipse";
  const name = tool === "ellipse" ? "ellipse" : "rectangle";
  const message = shape
    ? detail
      ? "Drag a " + (filled ? "filled " : "outlined ") + name +
        " with a live preview. Shift constrains to a " +
        (tool === "ellipse" ? "circle" : "square") +
        "; Alt draws from the centre. Escape cancels."
      : "Drag a " + (filled ? "filled " : "outlined ") + name +
        " · Shift constrains · Alt from centre · Esc cancels"
    : tool === "line"
      ? detail ? "Line previews from its original starting pixel and commits once on release."
        : "Drag a straight pixel line · release to commit · Esc cancels"
    : tool === "fill"
      ? detail ? "Bucket fills only connected pixels with exactly matching RGBA values."
        : "Fill a four-connected RGBA region · one undo step"
    : tool === "eraser"
      ? detail ? "Eraser makes pixels fully transparent (alpha 0). Java export requires an opaque texture."
        : "Erase RGBA pixels in 3D or 2D · Esc cancels"
    : tool === "eyedropper"
      ? "Sample a color from the texture sheet or visible model."
      : detail ? "Pencil paints opaque pixels. Click the eyedropper to sample an RGB color."
        : "Paint in 3D or on the texture sheet · Esc cancels stroke";
  return <>{message}</>;
}
