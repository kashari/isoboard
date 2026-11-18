import { describe, expect, it, beforeEach } from "vitest";
import { project, unproject, depthSort, freeCell, viewCenterCell } from "@/lib/isometric";
import { makeDemo } from "@/lib/demo";
import { importDiagram } from "@/lib/import-diagram";
import { useDiagram, newId, emptyDiagram } from "@/store/diagram";

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
