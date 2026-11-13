import { Box, Compass, Orbit, Paintbrush, Sparkles } from "lucide-react";
import type { EditorDocument } from "../editor/domain";

/**
 * A discoverable guided starting point instead of the normal empty inspector.
 * Actions only navigate existing editable data; they create no document changes.
 */
export function ShowcaseGuide({
  document, onInspectCore, onInspectGimbals, onPaintStarChart
}: {
  document: EditorDocument;
  onInspectCore: () => void;
  onInspectGimbals: () => void;
  onPaintStarChart: () => void;
}) {
  return <section className="showcase-guide" aria-label="Aetherheart showcase guide">
    <div className="showcase-guide-emblem" aria-hidden="true">
      <span className="showcase-guide-emblem-orbit"><Orbit size={42} strokeWidth={1.1}/></span>
      <Sparkles size={17} strokeWidth={1.5} className="showcase-guide-emblem-star"/>
    </div>
    <div className="showcase-guide-kicker">THE MASTERPIECE COLLECTION / 001</div>
    <h2>The Aetherheart</h2>
    <p className="showcase-guide-subtitle">A celestial relay, frozen between engineering and magic.</p>
    <div className="showcase-guide-rule"><span>AUTHORED AS A NATIVE 3DMC PROJECT</span></div>
    <div className="showcase-guide-metrics" aria-label="Showcase details">
      <div><strong>{document.cuboids.length}</strong><span>ELEMENTS</span></div>
      <div><strong>{document.groups?.length ?? 0}</strong><span>ASSEMBLIES</span></div>
      <div><strong>{document.textures.length}</strong><span>MATERIALS</span></div>
    </div>
    <div className="showcase-guide-materials" aria-label="Showcase material colors">
      {["#192137", "#af8455", "#eddca7", "#6fd6da", "#7461ae", "#c5eee8"].map(color =>
        <span key={color} style={{ backgroundColor: color }}/>)}
    </div>
    <div className="showcase-guide-navigation">
      <h3>Explore the construction</h3>
      <p>Select a chapter to jump into the actual editable scene.</p>
      <button type="button" onClick={onInspectCore}>
        <span className="showcase-guide-action-icon"><Sparkles size={18}/></span>
        <span><strong>Inspect the crystal</strong><small>Prismatic facets & suspended core</small></span>
        <span aria-hidden="true">↗</span>
      </button>
      <button type="button" onClick={onInspectGimbals}>
        <span className="showcase-guide-action-icon"><Orbit size={18}/></span>
        <span><strong>Explore the gyroscopes</strong><small>Three sculpted interlocking orbits</small></span>
        <span aria-hidden="true">↗</span>
      </button>
      <button type="button" onClick={onPaintStarChart}>
        <span className="showcase-guide-action-icon"><Paintbrush size={18}/></span>
        <span><strong>Paint the star chart</strong><small>Pixel artwork & editable layers</small></span>
        <span aria-hidden="true">↗</span>
      </button>
    </div>
    <p className="showcase-guide-note"><Box size={15}/>
      Nothing is baked. Save the entire model as a native source,
      or export an experimental Java 1.21.4 visual replacement.
    </p>
    <div className="showcase-guide-footer"><Compass size={14}/> DRAG TO ORBIT · SCROLL TO ZOOM</div>
  </section>;
}

/** Informational editorial overlay. It does not intercept the orbit gesture. */
export function ShowcaseStageSignature({ parts }: { parts: number }) {
  return <div className="showcase-stage-signature" aria-label="The Aetherheart artwork">
    <span>INTERACTIVE MINECRAFT ARTIFACT / 001</span>
    <h2>THE<br/>AETHERHEART<span> ✦</span></h2>
    <p>Celestial relay · {parts} sculpted parts<br/>An exercise in pixels, precision and light.</p>
    <div className="showcase-stage-line"><span/> LOOK CLOSER</div>
  </div>;
}
