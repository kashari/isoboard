import { describe, expect, it, beforeEach } from "vitest";
import {
  project,
  unproject,
  depthSort,
  freeCell,
  viewCenterCell,
  edgeRoute,
  trimRoute,
  labelSpot,
} from "@/lib/isometric";
import { makeDemo } from "@/lib/demo";
import { importDiagram } from "@/lib/import-diagram";
import { useDiagram, newId, emptyDiagram, shiftBend } from "@/store/diagram";

describe("Isometric grid rules", () => {
  it("projects grid coordinates and elevation using the specified formula", () => {
    expect(project(4, 2, 1)).toEqual({ x: 64, y: 64 });
    expect(unproject(64, 64, 1)).toEqual({ gx: 4, gy: 2 });
  });
  it("sorts nearer nodes after farther nodes", () => {
    const demo = makeDemo();
    const nodes = demo.nodes.filter((n) => n.type !== "zone");
    expect(depthSort([...nodes].reverse()).map((n) => n.id)).toEqual([
      "user",
      "client",
      "dns",
      "web",
      "db",
    ]);
  });
});
describe("Diagram editing", () => {
  beforeEach(() =>
    useDiagram.setState({
      diagram: makeDemo(),
      past: [],
      future: [],
      selection: ["web"],
      selectedEdge: null,
    }),
  );
  it("undoes and redoes an edit", () => {
    useDiagram.getState().updateNode("web", { gx: 8 });
    expect(useDiagram.getState().diagram.nodes.find((n) => n.id === "web")?.gx).toBe(8);
    useDiagram.getState().undo();
    expect(useDiagram.getState().diagram.nodes.find((n) => n.id === "web")?.gx).toBe(7);
    useDiagram.getState().redo();
    expect(useDiagram.getState().diagram.nodes.find((n) => n.id === "web")?.gx).toBe(8);
  });
  it("deletes attached edges when deleting a node", () => {
    useDiagram.getState().remove();
    expect(useDiagram.getState().diagram.nodes.some((n) => n.id === "web")).toBe(false);
    expect(useDiagram.getState().diagram.edges.map((e) => e.id)).toEqual(["e1", "e2"]);
  });
  it("duplicates selected nodes one grid cell in each direction", () => {
    useDiagram.getState().duplicate();
    const node = useDiagram.getState().diagram.nodes.at(-1);
    expect(node?.gx).toBe(8);
    expect(node?.gy).toBe(-2);
    expect(node?.id).not.toBe("web");
  });
  it("seeds the requested user to database chain", () => {
    expect(makeDemo().edges.map((e) => [e.from, e.to])).toEqual([
      ["user", "client"],
      ["client", "dns"],
      ["dns", "web"],
      ["web", "db"],
    ]);
  });
  it("round-trips JSON and rejects dangling connections", () => {
    expect(importDiagram(JSON.stringify(makeDemo()))).toEqual(makeDemo());
    const diagram = makeDemo();
    const edge = diagram.edges[0];
    if (!edge) throw new Error("Missing demo edge");
    edge.to = "missing";
    expect(() => importDiagram(JSON.stringify(diagram))).toThrow();
  });
  it("autosaves projects and restores the current diagram", () => {
    useDiagram.getState().updateNode("web", { label: "API server" });
    useDiagram.getState().save();
    useDiagram.setState({ diagram: makeDemo() });
    useDiagram.getState().hydrate();
    expect(useDiagram.getState().diagram.nodes.find((n) => n.id === "web")?.label).toBe(
      "API server",
    );
  });
});
describe("Placing new blocks", () => {
  it("never drops a block on top of an existing one", () => {
    const nodes = makeDemo().nodes;
    let placed = [...nodes];
    for (let i = 0; i < 12; i++) {
      const cell = freeCell(placed, 0, 0);
      const clash = placed.some(
        (n) => n.type !== "zone" && Math.abs(n.gx - cell.gx) < 4 && Math.abs(n.gy - cell.gy) < 4,
      );
      expect(clash).toBe(false);
      placed = [...placed, { ...nodes[2]!, id: `n${i}`, ...cell }];
    }
  });
  it("finds the grid cell in the middle of the view", () => {
    const p = project(5, -2);
    expect(viewCenterCell({ x: 400 - p.x, y: 300 - p.y, zoom: 1 }, 800, 600)).toEqual({
      gx: 5,
      gy: -2,
    });
  });
});
describe("First visit", () => {
  it("starts with an empty workbench when nothing is saved", () => {
    localStorage.clear();
    useDiagram.setState({ diagram: emptyDiagram(), projects: [] });
    useDiagram.getState().hydrate();
    expect(useDiagram.getState().diagram.nodes).toEqual([]);
    expect(useDiagram.getState().diagram.edges).toEqual([]);
  });
});
describe("Ids", () => {
  it("falls back to getRandomValues when randomUUID is unavailable (plain-HTTP LAN access)", () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      const a = newId();
      expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(newId()).not.toBe(a);
    } finally {
      Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
    }
  });
});
describe("Connectors: routes, labels and step numbers", () => {
  const at = (id: string, gx: number, gy: number) => ({
    ...makeDemo().nodes[0]!,
    id,
    type: "service" as const,
    gx,
    gy,
    gz: 0,
    label: id,
    sublabel: "",
  });
  const a = at("a", 0, 0),
    b = at("b", 4, 3);
  it("routes along the iso axes through the default corner or a custom elbow", () => {
    expect(edgeRoute(a, b)).toEqual([project(0, 0), project(4, 0), project(4, 3)]);
    // Elbow at (2, 5): a → (2,0) → (2,5) → (4,5) → b, every segment along gx or gy.
    expect(edgeRoute(a, b, { gx: 2, gy: 5 })).toEqual([
      project(0, 0),
      project(2, 0),
      project(2, 5),
      project(4, 5),
      project(4, 3),
    ]);
    // Straight neighbours never yield a zero-length last segment (it would break the arrow).
    const r = edgeRoute(a, at("c", 4, 0));
    expect(r).toHaveLength(2);
  });
  it("trims a route at both blocks and keeps a tag off blocks when it can", () => {
    const pts = edgeRoute(a, at("c", 8, 0));
    const t = trimRoute(pts, 40, 40);
    const len = (p: { x: number; y: number }[]) => Math.hypot(p[1]!.x - p[0]!.x, p[1]!.y - p[0]!.y);
    expect(len(t)).toBeCloseTo(len(pts) - 80);
    const blocked = { x0: -1000, y0: -1000, x1: (t[0]!.x + t[1]!.x) / 2 + 10, y1: 1000 };
    const spot = labelSpot(t, 20, [blocked]);
    expect(spot.x).toBeGreaterThan(blocked.x1);
  });
  it("toggles step numbers and reorders steps with undo", () => {
    const s = useDiagram.getState();
    s.open({ ...emptyDiagram(), nodes: [a, b, at("c", 8, 0)] });
    s.addEdge("a", "b");
    s.addEdge("b", "c");
    const [first, second] = useDiagram.getState().diagram.edges.map((e) => e.id);
    s.toggleSteps();
    expect(useDiagram.getState().diagram.steps).toBe(true);
    s.moveEdgeStep(second!, -1);
    expect(useDiagram.getState().diagram.edges.map((e) => e.id)).toEqual([second, first]);
    s.moveEdgeStep(second!, -1); // already first: no-op
    expect(useDiagram.getState().diagram.edges[0]!.id).toBe(second);
    s.undo();
    s.undo();
    expect(useDiagram.getState().diagram.steps).toBe(true);
    s.undo();
    expect(useDiagram.getState().diagram.steps).toBeFalsy();
  });
  it("moves a custom elbow with duplicated blocks", () => {
    expect(shiftBend({ bend: { gx: 2, gy: 5 }, x: 1 }, 1, 1)).toEqual({
      bend: { gx: 3, gy: 6 },
      x: 1,
    });
    expect(shiftBend({}, 1, 1)).toEqual({});
  });
});
