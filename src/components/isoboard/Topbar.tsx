import { useEffect, useState } from "react";
import {
  Undo2,
  Redo2,
  ChevronDown,
  FolderOpen,
  Save,
  SaveAll,
  FolderInput,
  ImageDown,
  Presentation,
  Maximize,
  Minimize,
  Eraser,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDiagram } from "@/store/diagram";
import { toggleFullscreen } from "@/lib/fullscreen";
import { saveDiagram, openDiagram, clearBoard } from "./file-actions";
export function Logo() {
  return (
    <div className="brand">
      <img
        src={`${import.meta.env.BASE_URL}favicon.svg`}
        alt=""
        width={30}
        height={30}
        className="brand-mark"
      />
      <span>
        isoboard<span className="brand-period">.</span>
      </span>
    </div>
  );
}
function useFullscreen() {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const sync = () => setFull(!!document.fullscreenElement);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  return full;
}
export function Topbar({ onProjects, onExport }: { onProjects: () => void; onExport: () => void }) {
  const full = useFullscreen();
  const { diagram, past, future, undo, redo, saved, commit, mode, setMode } = useDiagram();
  const [menu, setMenu] = useState(false);
  return (
    <header className="topbar">
      <Button variant="ghost" className="brand-button" onClick={onProjects} title="Open projects">
        <Logo />
      </Button>
      <span className="topbar-rule" />
      <div className="project-heading">
        <div className="project-name-row">
          <input
            aria-label="Project name"
            value={diagram.name}
            onChange={(e) => commit((d) => ({ ...d, name: e.target.value }))}
          />
          <ChevronDown size={13} onClick={onProjects} />
        </div>
        <span className="project-save">
          <span className={saved ? "status-dot" : "status-dot paused"} />
          {saved ? "Saved" : "Saving…"}
        </span>
      </div>
      <div className="mode-switch" role="group" aria-label="Mode">
        {(
          [
            ["architecture", "Architecture"],
            ["flow", "Flow"],
            ["state", "State machine"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            variant="ghost"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="topbar-actions">
        <div className="history-buttons">
          <Button
            variant="ghost"
            size="icon"
            title="Undo (Ctrl Z)"
            aria-label="Undo"
            disabled={!past.length}
            onClick={undo}
          >
            <Undo2 />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Redo (Ctrl Shift Z)"
            aria-label="Redo"
            disabled={!future.length}
            onClick={redo}
          >
            <Redo2 />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={full ? "Exit full screen (Shift F)" : "Full screen (Shift F)"}
            aria-label={full ? "Exit full screen" : "Full screen"}
            aria-pressed={full}
            onClick={toggleFullscreen}
          >
            {full ? <Minimize /> : <Maximize />}
          </Button>
        </div>
        <div className="export-wrapper">
          <Button variant="outline" onClick={() => setMenu(!menu)} className="export-button">
            File
            <ChevronDown size={12} />
          </Button>
          {menu && (
            <>
              <div className="menu-backdrop" onClick={() => setMenu(false)} />
              <div className="export-menu panel" role="menu">
                {(
                  [
                    [FolderInput, "Open…", "Ctrl O", () => void openDiagram()],
                    [Save, "Save to device", "Ctrl S", () => void saveDiagram()],
                    [SaveAll, "Save as…", "Ctrl ⇧ S", () => void saveDiagram(true)],
                    [ImageDown, "Export…", "Ctrl E", onExport],
                    [FolderOpen, "My projects", "", onProjects],
                    [Eraser, "Clear board", "", clearBoard],
                  ] as const
                ).map(([Icon, label, keys, action]) => (
                  <Button
                    key={label}
                    variant="ghost"
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      action();
                    }}
                  >
                    <Icon />
                    {label}
                    {keys && <kbd>{keys}</kbd>}
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>
        <Button
          variant="outline"
          className="export-button"
          onClick={onExport}
          title="Export (Ctrl E)"
        >
          <ImageDown />
          Export
        </Button>
        <Button
          className="present-button"
          title="Present (P)"
          onClick={() => useDiagram.getState().present()}
        >
          <Presentation />
          Present
        </Button>
      </div>
    </header>
  );
}
