import { Circle, Eraser, Minus, Paintbrush, PaintBucket, Pipette, Square } from "lucide-react";
import type { ReactNode } from "react";
import type { Tool } from "./EditorViewport";

function RailButton({ active, label, onClick, children }: {
  active: boolean; label: string; onClick: () => void; children: ReactNode;
}) {
  return <button type="button" className={"icon-button" + (active ? " active" : "")}
    title={label} aria-label={label} aria-pressed={active} onClick={onClick}>{children}</button>;
}

export function PaintToolRail({ tool, filled, onSelect }: {
  tool: Tool; filled: boolean; onSelect: (tool: Tool) => void;
}) {
  return <>
    <RailButton active={tool === "pencil"} label="Pixel pencil (B)" onClick={() => onSelect("pencil")}><Paintbrush size={18}/></RailButton>
    <RailButton active={tool === "line"} label="Line tool (L)" onClick={() => onSelect("line")}><Minus size={18}/></RailButton>
    <RailButton active={tool === "rectangle"} label={"Rectangle " + (filled ? "filled" : "outline") + " (U)"} onClick={() => onSelect("rectangle")}><Square size={18}/></RailButton>
    <RailButton active={tool === "ellipse"} label={"Ellipse " + (filled ? "filled" : "outline") + " (O)"} onClick={() => onSelect("ellipse")}><Circle size={18}/></RailButton>
    <RailButton active={tool === "eraser"} label="Pixel eraser (E)" onClick={() => onSelect("eraser")}><Eraser size={18}/></RailButton>
    <RailButton active={tool === "fill"} label="Fill connected area (G)" onClick={() => onSelect("fill")}><PaintBucket size={18}/></RailButton>
    <RailButton active={tool === "eyedropper"} label="Eyedropper (I)" onClick={() => onSelect("eyedropper")}><Pipette size={18}/></RailButton>
  </>;
}
