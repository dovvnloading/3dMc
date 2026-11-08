import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ImagePlus, Info, X } from "lucide-react";
import type { DecodedTexture, TextureImportPolicy } from "../editor/textureImport";
import { canAdoptPngDimensions } from "../editor/textureImport";

interface Props {
  image: DecodedTexture;
  isAdding?: boolean;
  currentWidth: number;
  currentHeight: number;
  paintedFaces: number;
  onClose: () => void;
  onConfirm: (policy: TextureImportPolicy) => void;
}

export function TextureImportDialog({
  image, isAdding = false, currentWidth, currentHeight, paintedFaces, onClose, onConfirm
}: Props) {
  const [policy, setPolicy] = useState<TextureImportPolicy>("keep-size");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mayAdopt = canAdoptPngDimensions(image);
  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    context?.putImageData(new ImageData(
      new Uint8ClampedArray(image.pixels), image.width, image.height
    ), 0, 0);
  }, [image]);
  const targetWidth = policy === "use-png-size" ? image.width : currentWidth;
  const targetHeight = policy === "use-png-size" ? image.height : currentHeight;
  const resamples = image.width !== targetWidth || image.height !== targetHeight;
  return <div className="modal-shade png-import-shade">
    <div className="png-import-modal" role="dialog" aria-modal="true"
      aria-labelledby="png-import-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}>
      <header className="png-import-heading">
        <div className="png-import-symbol"><ImagePlus size={23}/></div>
        <div>
          <span className="png-import-kicker">TEXTURE IMPORT · PREFLIGHT</span>
          <h2 id="png-import-title">{isAdding ? "Add a texture asset?" : "Replace the shared texture?"}</h2>
          <p>Review how this PNG will be applied before changing your project.</p>
        </div>
        <button type="button" aria-label="Cancel PNG import"
          className="png-import-close" onClick={onClose}><X size={18}/></button>
      </header>
      <div className="png-import-body">
        <div className="png-import-preview">
          <div className="png-import-checker">
            <canvas ref={canvasRef} width={image.width} height={image.height}
              style={{
                width: Math.round(164 * image.width / Math.max(image.width, image.height)),
                height: Math.round(164 * image.height / Math.max(image.width, image.height)),
                imageRendering: "pixelated"
              }}
              aria-label={"Preview of " + image.name}/>
          </div>
          <strong title={image.name}>{image.name}</strong>
          <span>{image.width} × {image.height} pixels</span>
          <span>{image.hasAlpha
            ? image.translucentPixels + " transparent or translucent pixels"
            : "Opaque RGBA"}</span>
        </div>
        <div className="png-import-options">
          <h3>Choose how to fit it</h3>
          <label className={"png-import-option" + (policy === "keep-size" ? " active" : "")}>
            <input type="radio" name="texture-policy" value="keep-size"
              checked={policy === "keep-size"} onChange={() => setPolicy("keep-size")}/>
            <span><strong>Keep the current canvas</strong>
              <small>{currentWidth} × {currentHeight} · nearest-neighbor pixel scaling.
                Face UV coordinates stay unchanged.</small></span>
          </label>
          <label className={"png-import-option" + (policy === "use-png-size" ? " active" : "")}>
            <input type="radio" name="texture-policy" value="use-png-size"
              checked={policy === "use-png-size"} disabled={!mayAdopt}
              onChange={() => setPolicy("use-png-size")}/>
            <span><strong>Use the PNG dimensions</strong>
              <small>{mayAdopt
                ? image.width + " × " + image.height + " · keep every source texel at the original size."
                : "Requires a square 16, 32 or 64-pixel PNG."}</small></span>
          </label>
          <div className="png-import-result">
            <span>RESULTING CANVAS</span>
            <strong>{targetWidth} × {targetHeight}</strong>
          </div>
          <div className="png-import-notices">
            <p><Info size={15}/><span>
              {isAdding ? "A new named texture will be added. Assign it to any face in the Paint inspector." :
                "This replaces the selected texture and affects all faces that use it."}
              {isAdding ? "" : " Current painted element count: " + paintedFaces + "."}
              It is <strong>one undoable edit</strong>; existing source textures remain in Undo history.
            </span></p>
            {resamples && <p><AlertTriangle size={15}/><span>
              Nearest-neighbor resampling changes pixel dimensions without smoothing. A non-square PNG is stretched
              to the current canvas aspect ratio.
            </span></p>}
            {image.hasAlpha && <p><AlertTriangle size={15}/><span>
              Transparency is retained in the native .3dmc source. The experimental Java 1.21.4 exporter
              currently blocks transparent textures.
            </span></p>}
            <p><Info size={15}/><span>
              Browser PNG decoding normalizes the source into RGBA pixels; RGB values hidden beneath fully
              transparent pixels may change. Keep the original PNG separately if that data matters.
            </span></p>
          </div>
        </div>
      </div>
      <footer className="png-import-actions">
        <button type="button" className="text-button quiet" onClick={onClose}>Cancel</button>
        <button type="button" className="text-button primary" onClick={() => onConfirm(policy)}>
          <ImagePlus size={16}/>{isAdding ? "Add texture asset" : "Replace shared texture"}
        </button>
      </footer>
    </div>
  </div>;
}
