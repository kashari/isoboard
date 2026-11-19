import { useRef, useState } from "react";
import {
  Undo2,
  Redo2,
  ChevronDown,
  Check,
  FolderOpen,
  Download,
  Upload,
  FileJson,
  Image,
  FileImage,
  Presentation,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDiagram } from "@/store/diagram";
import { importDiagram } from "@/lib/import-diagram";
import { snapshotCanvas, snapshotToPng } from "@/lib/export-view";
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
export function downloadFile(content: string | Blob, name: string, type: string) {
  const url = URL.createObjectURL(
    content instanceof Blob ? content : new Blob([content], { type }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
/**
 * The top bar keeps only what you reach for: the project, the mode, undo/redo, export and
 * Present. Everything else lives behind shortcuts (⌘K search, [ palette, F focus).
 */
export function Topbar({ onProjects }: { onProjects: () => void }) {
  const { diagram, past, future, undo, redo, saved, commit, mode, setMode } = useDiagram();
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  /** Exports exactly the current canvas view (see lib/export-view). */
  async function exportView(format: "svg" | "png") {
    const svg = document.querySelector<SVGSVGElement>(".diagram-canvas");
    if (!svg || exporting) return;
    setExporting(true);
    try {
      const snapshot = await snapshotCanvas(svg);
      if (format === "svg") downloadFile(snapshot.svg, diagram.name + ".svg", "image/svg+xml");
      else downloadFile(await snapshotToPng(snapshot, 3), diagram.name + ".png", "image/png");
      setMenu(false);
    } catch {
      setError("Export failed — please try again.");
    } finally {
      setExporting(false);
    }
  }
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
        </div>
        <div className="export-wrapper">
          <Button variant="outline" onClick={() => setMenu(!menu)} className="export-button">
            Export
            <ChevronDown size={12} />
          </Button>
          {menu && (
            <>
              <div className="menu-backdrop" onClick={() => setMenu(false)} />
              <div className="export-menu panel">
                <Button
                  variant="ghost"
                  onClick={() => {
                    downloadFile(
                      JSON.stringify(diagram, null, 2),
                      diagram.name + ".json",
                      "application/json",
                    );
                    setMenu(false);
                  }}
                >
                  <FileJson />
                  Export JSON
                  <Download size={13} />
                </Button>
                <Button variant="ghost" disabled={exporting} onClick={() => void exportView("png")}>
                  <Image />
                  Export PNG (3×)
                  <Download size={13} />
                </Button>
                <Button variant="ghost" disabled={exporting} onClick={() => void exportView("svg")}>
                  <FileImage />
                  Export SVG
                  <Download size={13} />
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    input.current?.click();
                    setMenu(false);
                  }}
                >
                  <Upload />
                  Import JSON
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    onProjects();
                    setMenu(false);
                  }}
                >
                  <FolderOpen />
                  My projects
                </Button>
              </div>
            </>
          )}
        </div>
        <Button
          className="present-button"
          title="Present (P)"
          onClick={() => useDiagram.getState().present()}
        >
          <Presentation />
          Present
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-label="Import diagram"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const diagram = importDiagram(await file.text());
            useDiagram.getState().open(diagram);
            setError("");
          } catch {
            setError("This file is not a valid Isoboard diagram.");
          }
          e.target.value = "";
        }}
      />
      {error && (
        <div className="import-error" role="alert">
          {error}
          <Button variant="ghost" onClick={() => setError("")}>
            Dismiss
            <Check />
          </Button>
        </div>
      )}
    </header>
  );
}
