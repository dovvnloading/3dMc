import { useState } from "react";
import { Box, FilePlus2, FlaskConical, Layers3, Orbit, Save, Sparkles, X } from "lucide-react";
import type { ProjectTemplate, NewProjectOptions, TextureResolution } from "../editor/templates";
import { PROJECT_TEMPLATES } from "../editor/templates";
import { AETHERHEART_NAME } from "../editor/aetherheart";
import { ModalDialog } from "./ModalDialog";

interface Props {
  onClose: () => void;
  onCreate: (options: NewProjectOptions) => Promise<boolean>;
  onBackup: () => Promise<void>;
}

const PRESETS: readonly TextureResolution[] = [16, 32, 64];

function TemplateIcon({ id }: { id: ProjectTemplate }) {
  if (id === "aetherheart") return <Orbit size={30} strokeWidth={1.7}/>;
  if (id === "blank") return <FilePlus2 size={27} strokeWidth={1.6}/>;
  if (id === "cube") return <Box size={28} strokeWidth={1.6}/>;
  if (id === "lantern") return <Sparkles size={27} strokeWidth={1.6}/>;
  return <FlaskConical size={27} strokeWidth={1.6}/>;
}

export function NewProjectDialog({ onClose, onCreate, onBackup }: Props) {
  const [name, setName] = useState("Untitled Project");
  const [template, setTemplate] = useState<ProjectTemplate>("cube");
  const [resolution, setResolution] = useState<TextureResolution>(32);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fixedResolution = template === "aetherheart" || template === "lantern" || template === "diagnostic";
  const actualResolution = template === "aetherheart" || template === "diagnostic" ? 64 :
    template === "lantern" ? 32 : resolution;
  const create = async () => {
    if (creating || !name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await onCreate({
        name: name.trim(), template, resolution: actualResolution
      });
      if (!created) setError("The project could not be opened. Check local recovery ownership.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create project.");
    } finally {
      setCreating(false);
    }
  };

  return <ModalDialog className="new-project-modal" labelledBy="new-project-title"
    onCancel={() => { if (!creating) onClose(); }}>
      <header className="new-project-heading">
        <div className="new-project-symbol"><Layers3 size={24} strokeWidth={1.7}/></div>
        <div>
          <span className="new-project-kicker">START SOMETHING ORIGINAL</span>
          <h2 id="new-project-title">Create a new project</h2>
          <p>Choose a starting point. Every element, pixel and face is editable.</p>
        </div>
        <button className="new-project-close" onClick={onClose}
          aria-label="Close new project" disabled={creating}><X size={18}/></button>
      </header>

      <div className="new-project-form">
        <label className="new-project-label" htmlFor="new-project-name">Project name</label>
        <input data-dialog-initial-focus id="new-project-name" aria-label="New project name"
          className="new-project-name" value={name} maxLength={100}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void create();
            }
          }}/>
        <span className="new-project-label template-label" id="project-templates-label">Start from a template</span>
        <div className="template-grid" role="group" aria-labelledby="project-templates-label">
          {PROJECT_TEMPLATES.map((item) => <button type="button" key={item.id}
            className={"template-card template-" + item.id +
              (template === item.id ? " chosen" : "")}
            aria-pressed={template === item.id}
            onClick={() => {
              setTemplate(item.id);
              if (name === "Untitled Project" || name === AETHERHEART_NAME)
                setName(item.id === "aetherheart" ? AETHERHEART_NAME : "Untitled Project");
              setError(null);
            }}>
            <span className="template-card-art"><TemplateIcon id={item.id}/></span>
            <span className="template-card-heading">{item.title}</span>
            <span className="template-card-description">{item.detail}</span>
            <span className="template-card-meta">{item.elements} <span>·</span> {item.texture}</span>
            <span className="template-select-indicator" aria-hidden="true"/>
          </button>)}
        </div>
        <div className="new-project-settings">
          <div><strong>Texture resolution</strong>
            <span>{fixedResolution
              ? "This authored template uses its original texture resolutions."
              : "Choose a square pixel canvas to begin with."}</span></div>
          <div className="new-project-resolution" role="group" aria-label="Texture resolution">
            {PRESETS.map((size) => <button key={size}
              type="button" aria-label={size + " pixel texture"}
              aria-pressed={actualResolution === size}
              disabled={creating || fixedResolution}
              onClick={() => setResolution(size)}>{size}</button>)}
          </div>
        </div>
        <p className="new-project-warning">
          Creating a project replaces the current workspace. Download the current project first
          if you want an independent copy. Local recovery is not a portable backup.
        </p>
        {error && <p role="alert" className="new-project-error">{error}</p>}
      </div>
      <footer className="new-project-actions">
        <button className="text-button quiet" onClick={() => void onBackup()}
          disabled={creating}><Save size={15}/>Backup current project</button>
        <div className="new-project-right-actions">
          <button className="text-button subtle" disabled={creating} onClick={onClose}>Cancel</button>
          <button className="text-button primary" disabled={!name.trim() || creating}
            onClick={() => void create()}>
            <FilePlus2 size={16}/>{creating ? "Creating…" : "Create project"}
          </button>
        </div>
      </footer>
  </ModalDialog>;
}
