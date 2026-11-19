import { useEffect, useRef, useState } from "react";
import { Canvas } from "./Canvas";
import { Palette } from "./Palette";
import { Inspector } from "./Inspector";
import { Topbar } from "./Topbar";
import { Projects } from "./Projects";
import { CommandPalette } from "./CommandPalette";
import { Presenter } from "./Presenter";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDiagram, newId } from "@/store/diagram";
import type { Node, Edge } from "@/types/diagram";
export function Editor() {
  const [projects, setProjects] = useState(false);
  const [command, setCommand] = useState(false);
  const [ready, setReady] = useState(false);
  // Layout: the palette can be hidden ([), focus mode (F) leaves only the canvas.
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [focus, setFocus] = useState(false);
  const clipboard = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const spaceStart = useRef(0);
  const togglePaletteRef = useRef(() => {});
  const { diagram, selection, selectedEdge, presentation } = useDiagram();
  const hasSelection = selection.length > 0 || selectedEdge !== null;
  useEffect(() => {
    useDiagram.getState().hydrate();
    try {
      setPaletteOpen(localStorage.getItem("isoboard-palette") !== "hidden");
    } catch {
      /* storage unavailable */
    }
    setReady(true);
  }, []);
  togglePaletteRef.current = () => togglePalette();
  const togglePalette = () =>
    setPaletteOpen((open) => {
      try {
        localStorage.setItem("isoboard-palette", open ? "hidden" : "shown");
      } catch {
        /* storage unavailable */
      }
      return !open;
    });
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => useDiagram.getState().save(), 500);
    return () => clearTimeout(timer);
  }, [diagram, ready]);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return;
      const s = useDiagram.getState();
      if (s.presentation) return; // the Presenter owns the keyboard
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommand((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setCommand(false);
        setProjects(false);
        setFocus(false);
        s.select([]);
      }
      if (!ctrl && !e.altKey && e.key === "[") {
        e.preventDefault();
        togglePaletteRef.current();
      }
      if (!ctrl && !e.altKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        s.present();
        return;
      }
      if (!ctrl && !e.altKey && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        setFocus((v) => !v);
      }
      if (ctrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      }
      if (ctrl && e.key.toLowerCase() === "d") {
        e.preventDefault();
        s.duplicate();
      }
      if (ctrl && e.key.toLowerCase() === "c") {
        e.preventDefault();
        clipboard.current = {
          nodes: s.diagram.nodes.filter((n) => s.selection.includes(n.id)),
          edges: s.diagram.edges.filter(
            (edge) => s.selection.includes(edge.from) && s.selection.includes(edge.to),
          ),
        };
      }
      if (ctrl && e.key.toLowerCase() === "v" && clipboard.current) {
        e.preventDefault();
        const copied = clipboard.current;
        const map = new Map(copied.nodes.map((n) => [n.id, newId()]));
        const nodes = copied.nodes.map((n) => ({
          ...structuredClone(n),
          id: map.get(n.id) ?? n.id,
          gx: n.gx + 2,
          gy: n.gy + 2,
        }));
        const edges = copied.edges.map((edge) => ({
          ...edge,
          id: newId(),
          from: map.get(edge.from) ?? edge.from,
          to: map.get(edge.to) ?? edge.to,
        }));
        s.commit((d) => ({ ...d, nodes: [...d.nodes, ...nodes], edges: [...d.edges, ...edges] }));
        s.select(nodes.map((n) => n.id));
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (s.selection.length || s.selectedEdge) s.remove();
      }
      const delta: Record<string, [number, number]> = {
        ArrowRight: [1, 0],
        ArrowLeft: [-1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const movement = delta[e.key];
      if (movement && s.selection.length) {
        e.preventDefault();
        const [x, y] = movement;
        s.commit((d) => ({
          ...d,
          nodes: d.nodes.map((n) =>
            s.selection.includes(n.id) ? { ...n, gx: n.gx + x, gy: n.gy + y } : n,
          ),
        }));
      }
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        spaceStart.current = performance.now();
      }
      if (e.key === "/") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('[aria-label="Search components"]')?.focus();
      }
    };
    const keyup = (e: KeyboardEvent) => {
      if (useDiagram.getState().presentation) return;
      if (e.code === "Space" && spaceStart.current) {
        if (performance.now() - spaceStart.current < 250)
          useDiagram.setState((s) => ({ playing: !s.playing }));
        spaceStart.current = 0;
      }
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
    };
  }, []);
  return (
    <div className={`isoboard-app ${presentation ? "is-presenting" : ""}`}>
      <Topbar
        onProjects={() => {
          useDiagram.getState().save();
          setProjects(true);
        }}
      />
      <div
        className={[
          "editor-layout",
          !paletteOpen || focus ? "no-palette" : "",
          !hasSelection || focus ? "no-inspector" : "",
          focus ? "focus-mode" : "",
        ].join(" ")}
      >
        <Palette onHide={togglePalette} />
        {ready ? <Canvas /> : <main className="canvas-area" />}
        <Inspector />
        {!paletteOpen && !focus && !presentation && (
          <Button
            variant="outline"
            className="palette-reopen"
            title="Show components ( [ )"
            onClick={togglePalette}
          >
            <PanelLeft />
            Components
          </Button>
        )}
      </div>
      {presentation && <Presenter />}
      {projects && <Projects onClose={() => setProjects(false)} />}{" "}
      {command && (
        <CommandPalette onClose={() => setCommand(false)} onProjects={() => setProjects(true)} />
      )}
    </div>
  );
}
