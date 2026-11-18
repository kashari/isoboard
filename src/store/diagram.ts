import { create } from "zustand";
import { defaultEdge } from "@/lib/logic";
import { readBend } from "@/lib/isometric";
import type { Diagram, Node, Edge, Viewport, Mode } from "@/types/diagram";
interface State {
  diagram: Diagram;
  projects: Diagram[];
  selection: string[];
  selectedEdge: string | null;
  past: Diagram[];
  future: Diagram[];
  playing: boolean;
  dark: boolean;
  saved: boolean;
  mode: Mode;
  setMode: (mode: Mode) => void;
  commit: (fn: (d: Diagram) => Diagram) => void;
  select: (ids: string[], edge?: string | null) => void;
  updateNode: (id: string, patch: Partial<Node>) => void;
  updateEdge: (id: string, patch: Partial<Edge>) => void;
  addNode: (node: Node) => void;
  addEdge: (from: string, to: string) => void;
  /** Moves a connector earlier (-1) or later (+1) in the step order. */
  moveEdgeStep: (id: string, delta: number) => void;
  toggleSteps: () => void;
  remove: () => void;
  duplicate: () => void;
  undo: () => void;
  redo: () => void;
  setViewport: (v: Viewport) => void;
  hydrate: () => void;
  save: () => void;
  open: (diagram: Diagram) => void;
  newProject: () => void;
  deleteProject: (id: string) => void;
  duplicateProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
}
/** RFC 4122 v4 id. `crypto.randomUUID` only exists in secure contexts (HTTPS or localhost),
 * so fall back to `getRandomValues` when the app is opened over a plain-HTTP LAN address. */
export function newId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
/** Moves a connector's custom elbow (`data.bend`) along with its blocks. */
export function shiftBend(data: Record<string, unknown>, dx: number, dy: number) {
  const bend = readBend(data);
  return bend ? { ...data, bend: { gx: bend.gx + dx, gy: bend.gy + dy } } : data;
}
/** A fresh, empty workbench — the default for new visitors and new projects. */
export function emptyDiagram(): Diagram {
  return {
    id: newId(),
    name: "Untitled diagram",
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
export const useDiagram = create<State>((set, get) => ({
  diagram: emptyDiagram(),
  projects: [],
  selection: [],
  selectedEdge: null,
  past: [],
  future: [],
  playing: true,
  dark: false,
  saved: true,
  mode: "architecture",
  setMode: (mode) => {
    set({ mode });
    try {
      localStorage.setItem("isoboard-mode", mode);
    } catch {
      /* storage unavailable */
    }
  },
  commit: (fn) =>
    set((s) => ({
      diagram: fn(s.diagram),
      past: [...s.past.slice(-49), s.diagram],
      future: [],
      saved: false,
    })),
  select: (selection, selectedEdge = null) => set({ selection, selectedEdge }),
  updateNode: (id, patch) =>
    get().commit((d) => ({
      ...d,
      nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    })),
  updateEdge: (id, patch) =>
    get().commit((d) => ({
      ...d,
      edges: d.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })),
  addNode: (node) => {
    get().commit((d) => ({ ...d, nodes: [...d.nodes, node] }));
    get().select([node.id]);
  },
  addEdge: (from, to) => {
    if (from === to) return;
    get().commit((d) => ({
      ...d,
      edges: [
        ...d.edges,
        {
          id: newId(),
          from,
          to,
          ...defaultEdge(
            d.nodes.find((n) => n.id === from),
            d.edges,
            d.nodes.find((n) => n.id === to),
          ),
          style: "solid",
          data: {},
        },
      ],
    }));
  },
  moveEdgeStep: (id, delta) =>
    get().commit((d) => {
      const i = d.edges.findIndex((e) => e.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= d.edges.length) return d;
      const edges = [...d.edges];
      [edges[i], edges[j]] = [edges[j]!, edges[i]!];
      return { ...d, edges };
    }),
  toggleSteps: () => get().commit((d) => ({ ...d, steps: !d.steps })),
  remove: () => {
    const { selection, selectedEdge } = get();
    get().commit((d) => ({
      ...d,
      nodes: d.nodes.filter((n) => !selection.includes(n.id)),
      edges: d.edges.filter(
        (e) => e.id !== selectedEdge && !selection.includes(e.from) && !selection.includes(e.to),
      ),
    }));
    get().select([]);
  },
  duplicate: () => {
    const { diagram, selection } = get();
    const idMap = new Map<string, string>();
    const nodes = diagram.nodes
      .filter((n) => selection.includes(n.id))
      .map((n) => {
        const id = newId();
        idMap.set(n.id, id);
        return { ...n, id, gx: n.gx + 1, gy: n.gy + 1, label: n.label + " copy" };
      });
    const edges = diagram.edges
      .filter((e) => idMap.has(e.from) && idMap.has(e.to))
      .map((e) => ({
        ...e,
        id: newId(),
        from: idMap.get(e.from) ?? e.from,
        to: idMap.get(e.to) ?? e.to,
        data: shiftBend(e.data, 1, 1),
      }));
    get().commit((d) => ({ ...d, nodes: [...d.nodes, ...nodes], edges: [...d.edges, ...edges] }));
    get().select(nodes.map((n) => n.id));
  },
  undo: () =>
    set((s) => {
      const diagram = s.past.at(-1);
      return diagram
        ? { diagram, past: s.past.slice(0, -1), future: [s.diagram, ...s.future], saved: false }
        : {};
    }),
  redo: () =>
    set((s) => {
      const diagram = s.future[0];
      return diagram
        ? { diagram, past: [...s.past, s.diagram], future: s.future.slice(1), saved: false }
        : {};
    }),
  setViewport: (viewport) => set((s) => ({ diagram: { ...s.diagram, viewport } })),
  hydrate: () => {
    try {
      const raw = localStorage.getItem("isoboard-projects");
      const current = localStorage.getItem("isoboard-current");
      const projects: Diagram[] = raw ? JSON.parse(raw) : [];
      const diagram = projects.find((d) => d.id === current) ?? projects[0] ?? get().diagram;
      const mode = localStorage.getItem("isoboard-mode");
      set({
        projects,
        diagram,
        dark: localStorage.getItem("isoboard-theme") === "dark",
        mode: mode === "flow" || mode === "state" ? mode : "architecture",
      });
    } catch {
      set({ projects: [] });
    }
  },
  save: () => {
    const { diagram, projects, dark } = get();
    const next = projects.some((d) => d.id === diagram.id)
      ? projects.map((d) => (d.id === diagram.id ? diagram : d))
      : [...projects, diagram];
    localStorage.setItem("isoboard-projects", JSON.stringify(next));
    localStorage.setItem("isoboard-current", diagram.id);
    localStorage.setItem("isoboard-theme", dark ? "dark" : "light");
    set({ projects: next, saved: true });
  },
  open: (diagram) =>
    set({ diagram, selection: [], selectedEdge: null, past: [], future: [], saved: false }),
  newProject: () => get().open(emptyDiagram()),
  deleteProject: (id) => {
    const next = get().projects.filter((d) => d.id !== id);
    set({ projects: next });
    localStorage.setItem("isoboard-projects", JSON.stringify(next));
    if (get().diagram.id === id) {
      if (next[0]) get().open(next[0]);
      else get().newProject();
    }
  },
  duplicateProject: (id) => {
    const project = get().projects.find((d) => d.id === id);
    if (project)
      get().open({ ...structuredClone(project), id: newId(), name: project.name + " copy" });
  },
  renameProject: (id, name) => {
    set((s) => ({ projects: s.projects.map((d) => (d.id === id ? { ...d, name } : d)) }));
    if (get().diagram.id === id) get().commit((d) => ({ ...d, name }));
    localStorage.setItem("isoboard-projects", JSON.stringify(get().projects));
  },
}));
