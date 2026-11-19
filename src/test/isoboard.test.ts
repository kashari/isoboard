import { describe, expect, it, beforeEach } from "vitest";
import {
  project,
  unproject,
  depthSort,
  freeCell,
  viewCenterCell,
  trimRoute,
  labelSpot,
} from "@/lib/isometric";
import {
  readRoute,
  routeCorners,
  routeSegments,
  autoRoute,
  grabSegment,
  setSegment,
  normalizeRoute,
  shiftRoute,
  layoutEdges,
  presentableEdges,
  LANE,
} from "@/lib/routing";
import { makeDemo } from "@/lib/demo";
import { importDiagram } from "@/lib/import-diagram";
import { serializeDiagram, fileName } from "@/lib/file-io";
import { pdfBytes } from "@/lib/export-view";
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
  const cells = (r: { gx: number; gy: number }[]) => r.map((p) => [p.gx, p.gy]);
  it("routes along the iso axes: L by default, legacy elbows still read", () => {
    expect(
      cells(routeSegments(a, b, autoRoute(a, b)).flatMap((s, i) => (i ? [s.q] : [s.p, s.q]))),
    ).toEqual([
      [0, 0],
      [4, 0],
      [4, 3],
    ]);
    // Older diagrams stored one elbow as data.bend: a → (2,0) → (2,5) → (4,5) → b.
    const legacy = readRoute({ bend: { gx: 2, gy: 5 } })!;
    expect(cells(routeCorners(a, b, legacy))).toEqual([
      [0, 0],
      [2, 0],
      [2, 5],
      [4, 5],
      [4, 3],
    ]);
    // Aligned blocks give one straight segment.
    expect(routeSegments(a, at("c", 4, 0), autoRoute(a, at("c", 4, 0)))).toHaveLength(1);
  });
  it("picks the L that goes around a block in the way", () => {
    const wall = at("wall", 4, 0);
    expect(autoRoute(a, b, [a, b, wall]).start).toBe("y");
    expect(autoRoute(a, b, [a, b]).start).toBe("x");
  });
  it("drags any segment sideways, including the anchored end ones", () => {
    const l = { start: "x" as const, stops: [] };
    // Grab the first segment (along gx at gy 0) and slide it to gy 2.
    const g = grabSegment(a, b, l, 0);
    const moved = setSegment(g.route, g.j, 2);
    expect(cells(routeSegments(a, b, moved).flatMap((s, i) => (i ? [s.q] : [s.p, s.q])))).toEqual([
      [0, 0],
      [0, 2],
      [4, 2],
      [4, 3],
    ]);
    // Slide the last segment (along gy at gx 4) to gx 6: a Z with a stub into b.
    const last = grabSegment(a, b, l, 1);
    expect(cells(routeCorners(a, b, setSegment(last.route, last.j, 6)))).toEqual([
      [0, 0],
      [6, 0],
      [6, 3],
      [4, 3],
    ]);
    // Normalising drops stops that no longer turn anything.
    expect(normalizeRoute(a, b, { start: "x", stops: [4, 0, 4] })).toEqual({
      start: "x",
      stops: [],
    });
  });
  it("gives connectors that share a line their own lane", () => {
    const c = at("c", 8, 0);
    const edge = (id: string, from: string, to: string) => ({
      id,
      from,
      to,
      label: "",
      style: "solid" as const,
      kind: "plain" as const,
      data: {},
    });
    const lay = layoutEdges([a, c], [edge("e1", "a", "c"), edge("e2", "c", "a")]);
    expect(lay).toHaveLength(2);
    expect(lay[0]!.path).not.toEqual(lay[1]!.path);
    // Same line, offset by one lane (LANE grid units → ~8px apart on screen).
    const gap = Math.abs(lay[0]!.points[0]!.y - lay[1]!.points.at(-1)!.y);
    expect(gap).toBeGreaterThan(5);
    expect(LANE).toBeGreaterThan(0.2);
    expect(presentableEdges([a, c], [edge("e1", "a", "c"), edge("x", "a", "gone")])).toHaveLength(
      1,
    );
  });
  it("trims a route at both blocks and keeps a tag off blocks when it can", () => {
    const pts = routeCorners(a, at("c", 8, 0), { start: "x", stops: [] })
      .slice(0, 2)
      .map((g) => project(g.gx, g.gy));
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
  it("moves a custom route (or legacy elbow) with its blocks", () => {
    expect(shiftRoute({ bend: { gx: 2, gy: 5 }, x: 1 }, 1, 1)).toEqual({
      bend: { gx: 3, gy: 6 },
      x: 1,
    });
    // stops alternate axes: 2 is a gx (start x), 5 a gy.
    expect(shiftRoute({ route: { start: "x", stops: [2, 5] } }, 1, 10)).toEqual({
      route: { start: "x", stops: [3, 15] },
    });
    expect(shiftRoute({}, 1, 1)).toEqual({});
  });
});

describe("Files and export formats", () => {
  it("reads .isoboard files (with envelope) and plain JSON alike", () => {
    const demo = makeDemo();
    expect(importDiagram(serializeDiagram(demo))).toEqual(demo);
    expect(importDiagram(JSON.stringify(demo))).toEqual(demo);
    expect(JSON.parse(serializeDiagram(demo)).format).toBe("isoboard");
  });
  it("makes file names that are safe on every OS", () => {
    expect(fileName('A/B: "c"?', ".isoboard")).toBe("A-B- -c-.isoboard");
    expect(fileName("  ", ".png")).toBe("diagram.png");
  });
  it("writes a valid one-page PDF around a JPEG", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const pdf = pdfBytes(jpeg, 40, 20, 30, 15);
    const text = new TextDecoder("latin1").decode(pdf);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/MediaBox [0 0 30.00 15.00]");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    // Every xref offset points at its object.
    const xref = text.slice(text.indexOf("xref"));
    const offsets = [...xref.matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(text.slice(o, o + 7)).toBe(`${i + 1} 0 obj`));
    expect(Number(/startxref\n(\d+)/.exec(text)![1])).toBe(text.indexOf("xref"));
  });
});
