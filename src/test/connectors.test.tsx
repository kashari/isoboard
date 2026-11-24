import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Canvas } from "@/components/isoboard/Canvas";
import { useDiagram } from "@/store/diagram";
import { Presenter } from "@/components/isoboard/Presenter";
import {
  autoRoute,
  layoutEdges,
  presentationSteps,
  routeSegments,
  sketchPath,
} from "@/lib/routing";
import { inside, nearestPort, portSpot, silhouette } from "@/lib/ports";
import { branchTone, stepNumbers } from "@/lib/logic";
import { project } from "@/lib/isometric";
import { importValue } from "@/lib/import-diagram";
import { buildSpec } from "@/lib/spec";
import { registry } from "@/nodes/registry";
import type { Edge, Node, NodeType } from "@/types/diagram";

for (const key of ["width", "height"])
  if (!(key in SVGSVGElement.prototype))
    Object.defineProperty(SVGSVGElement.prototype, key, {
      get: () => ({ baseVal: { value: 800 } }),
    });
if (!("PointerEvent" in window))
  Object.defineProperty(window, "PointerEvent", {
    value: class extends MouseEvent {
      pointerId = 1;
    },
  });

if (!("ResizeObserver" in window))
  Object.defineProperty(window, "ResizeObserver", {
    value: class {
      observe() {}
      disconnect() {}
    },
  });
if (!window.matchMedia)
  Object.defineProperty(window, "matchMedia", {
    value: () => ({ matches: true }),
  });

const block = (id: string, gx: number, gy = 0, type: NodeType = "service"): Node => ({
  id,
  type,
  gx,
  gy,
  gz: 0,
  label: id.toUpperCase(),
  sublabel: "",
  color: "blue",
  icon: "Server",
  data: {},
});
const edge = (id: string, from: string, to: string, patch: Partial<Edge> = {}): Edge => ({
  id,
  from,
  to,
  label: "",
  style: "solid",
  kind: "plain",
  data: {},
  ...patch,
});
const near = (p: { x: number; y: number }, q: { x: number; y: number }, d = 3) =>
  Math.hypot(p.x - q.x, p.y - q.y) < d;

describe("connector ends", () => {
  it("end exactly where the line meets each block's outline, front or back", () => {
    const nodes = [block("a", 0), block("b", 6), block("c", 6, -6)];
    const [ab, bc] = layoutEdges(nodes, [edge("e1", "a", "b"), edge("e2", "b", "c")]);
    // a → b runs along +gx: it leaves a's front face and arrives at b's back.
    for (const [l, from, to] of [
      [ab!, nodes[0]!, nodes[1]!],
      [bc!, nodes[1]!, nodes[2]!],
    ] as const) {
      const pa = silhouette(from)!,
        pb = silhouette(to)!;
      expect(inside(pa, l.ends.from)).toBe(false);
      expect(inside(pb, l.ends.to)).toBe(false);
      // …and right on the outline: a step back along the line is inside the block.
      const back = l.points[0]!;
      expect(near(l.ends.from, back, 4)).toBe(true);
    }
  });

  it("a pinned end leaves and arrives through its side, at its spot", () => {
    const a = block("a", 0),
      b = block("b", 6);
    // Leaving a through its back-right side (y-) forces the route to start along -gy.
    const r = autoRoute(a, b, [a, b], { from: { side: "y-", at: 0 }, to: { side: "y+", at: 0.5 } });
    const segs = routeSegments(a, b, r);
    expect(segs[0]!.axis).toBe("y");
    expect(segs[0]!.q.gy).toBeLessThan(0);
    expect(segs.at(-1)!.axis).toBe("y");
    expect(segs.at(-1)!.p.gy).toBeGreaterThan(0); // arrives from the front-left
    const [l] = layoutEdges(
      [a, b],
      [
        edge("e", "a", "b", {
          data: { fromPort: { side: "y-", at: 0 }, toPort: { side: "y+", at: 0.5 } },
        }),
      ],
    );
    expect(near(l!.ends.from, portSpot(a, { side: "y-", at: 0 }))).toBe(true);
    expect(near(l!.ends.to, portSpot(b, { side: "y+", at: 0.5 }))).toBe(true);
  });

  it("a straight connector with ends on different lines jogs across smoothly", () => {
    const [l] = layoutEdges(
      [block("a", 0), block("b", 8)],
      [
        edge("e", "a", "b", {
          data: { fromPort: { side: "x+", at: -0.6 }, toPort: { side: "x-", at: 0.6 } },
        }),
      ],
    );
    expect(l!.points.length).toBe(4);
    expect(l!.path).toContain("Q");
  });

  it("draws connectors by hand: two passes that wobble the same way every time", () => {
    const [l] = layoutEdges([block("a", 0), block("b", 6, 4)], [edge("e", "a", "b")]);
    const [one, two] = l!.sketch!;
    expect(one).not.toEqual(two);
    expect(one).not.toEqual(l!.path);
    expect(sketchPath(l!.points, "e:1", 0.8)).toEqual(one);
    // The ends stay on the line's ends, so it still meets the block and the arrowhead.
    const start = one
      .match(/^M (\S+) (\S+)/)!
      .slice(1)
      .map(Number);
    expect(near({ x: start[0]!, y: start[1]! }, l!.points[0]!, 1)).toBe(true);
  });

  it("clean lines skip the pencil passes and stop under a solid arrowhead", () => {
    const nodes = [block("a", 0), block("b", 6, 4)];
    const [sketch] = layoutEdges(nodes, [edge("e", "a", "b")]);
    const [clean] = layoutEdges(nodes, [edge("e", "a", "b")], { lines: "clean" });
    expect(clean!.sketch).toBeNull();
    const gap = (l: typeof clean) =>
      Math.hypot(l!.head.x - l!.points.at(-1)!.x, l!.head.y - l!.points.at(-1)!.y);
    expect(gap(clean)).toBeGreaterThan(gap(sketch) + 5);

    act(() =>
      useDiagram.setState({
        diagram: {
          id: "d",
          name: "t",
          nodes,
          edges: [edge("e", "a", "b")],
          viewport: { x: 1, y: 1, zoom: 1 },
        },
        selection: [],
        selectedEdge: null,
        past: [],
        future: [],
      }),
    );
    const { container } = render(<Canvas />);
    expect(container.querySelectorAll(".edge-line").length).toBe(2);
    fireEvent.click(container.querySelector('[aria-label="Hand-drawn connectors"]')!);
    expect(useDiagram.getState().diagram.lines).toBe("clean");
    expect(container.querySelectorAll(".edge-line").length).toBe(1);
    expect(container.querySelector(".edge-head-solid")).toBeTruthy();
    expect(importValue(useDiagram.getState().diagram).lines).toBe("clean");
    act(() => useDiagram.getState().undo());
    expect(useDiagram.getState().diagram.lines).toBeUndefined();
  });

  it("finds the spot on a block nearest the pointer", () => {
    const b = block("b", 0);
    expect(nearestPort(b, portSpot(b, { side: "x+", at: 0.4 }))).toEqual({ side: "x+", at: 0.4 });
    expect(nearestPort(b, portSpot(b, { side: "y-", at: -0.5 }))).toEqual({ side: "y-", at: -0.5 });
  });

  it("dragging an end handle pins it to a spot on another block; double-click lets it go", () => {
    const nodes = [block("a", 0), block("b", 6), block("c", 0, 6)];
    act(() =>
      useDiagram.setState({
        diagram: {
          id: "d",
          name: "t",
          nodes,
          edges: [edge("e", "a", "b", { data: { route: { start: "x", stops: [3] } } })],
          viewport: { x: 1, y: 1, zoom: 1 },
        },
        selection: [],
        selectedEdge: "e",
        selectedNote: null,
        past: [],
        future: [],
        presentation: null,
      }),
    );
    const { container } = render(<Canvas />);
    const svg = container.querySelector("svg.diagram-canvas")!;
    const handles = container.querySelectorAll(".edge-end");
    expect(handles.length).toBe(2);
    const spot = portSpot(nodes[2]!, { side: "x+", at: 0.3 });
    fireEvent.pointerDown(handles[1]!, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(svg, { clientX: spot.x + 1, clientY: spot.y + 1 });
    fireEvent.pointerUp(svg, { clientX: spot.x + 1, clientY: spot.y + 1 });
    const e = () => useDiagram.getState().diagram.edges[0]!;
    expect(e().to).toBe("c");
    // Pinned to that spot (the old route is dropped).
    expect(Object.keys(e().data)).toEqual(["toPort"]);
    expect(e().data["toPort"]).toMatchObject({ side: "x+" });
    const l = layoutEdges(nodes, [e()])[0]!;
    expect(near(l.ends.to, spot)).toBe(true);

    // Dropped on empty board: nothing changes.
    fireEvent.pointerDown(container.querySelectorAll(".edge-end")[0]!, { button: 0 });
    fireEvent.pointerMove(svg, { clientX: 900, clientY: -900 });
    fireEvent.pointerUp(svg, { clientX: 900, clientY: -900 });
    expect(e().from).toBe("a");

    fireEvent.doubleClick(container.querySelectorAll(".edge-end")[1]!);
    expect(e().data).toEqual({});
    act(() => useDiagram.getState().undo());
    act(() => useDiagram.getState().undo());
    expect(e()).toMatchObject({ to: "b", data: { route: { start: "x", stops: [3] } } });
  });
});

describe("flowcharts", () => {
  it("numbers a condition's branches as one step", () => {
    const { diagram } = buildSpec({
      nodes: [
        { id: "s", type: "start" },
        { id: "q", type: "condition" },
        { id: "y", type: "process" },
        { id: "n", type: "ko" },
        { id: "e", type: "end" },
      ],
      edges: ["s -> q", "q -> y: true", "q -> n: false", "y -> e"],
    });
    const n = stepNumbers(diagram!.nodes, diagram!.edges);
    expect(diagram!.edges.map((e) => n.get(e.id))).toEqual([1, 2, 2, 3]);
    const tags = layoutEdges(diagram!.nodes, diagram!.edges, { steps: true }).map(
      (l) => l.tag.badge,
    );
    expect(tags).toEqual(["1", "2", "2", "3"]);
    const q = diagram!.nodes.find((x) => x.id === "q");
    expect(diagram!.edges.map((e) => branchTone(e, e.from === "q" ? q : undefined))).toEqual([
      "",
      "yes",
      "no",
      "",
    ]);
  });

  it("presents a condition's branches together, as one step", () => {
    const { diagram } = buildSpec({
      nodes: [
        { id: "s", type: "start" },
        { id: "q", type: "condition", label: "Valid?" },
        { id: "y", type: "process", label: "Save" },
        { id: "n", type: "ko", label: "Reject" },
        { id: "e", type: "end" },
      ],
      edges: ["s -> q", "q -> y: true", "y -> e", "q -> n: false"],
    });
    const d = diagram!;
    expect(presentationSteps(d.nodes, d.edges).map((g) => g.map((e) => e.to))).toEqual([
      ["q"],
      ["y", "n"],
      ["e"],
    ]);
    act(() =>
      useDiagram.setState({
        diagram: d,
        selection: [],
        selectedEdge: null,
        selectedNote: null,
        presentation: { step: 2, follow: false },
      }),
    );
    const { container, unmount } = render(
      <>
        <Canvas />
        <Presenter />
      </>,
    );
    expect(container.querySelectorAll(".edge-tag.pres-current").length).toBe(2);
    const rows = [...container.querySelectorAll(".pres-branches li")].map((li) => li.textContent);
    expect(rows).toEqual(["trueSave", "falseRejectKO"]);
    expect(container.querySelector(".pres-end-fail")?.textContent).toBe("KO");
    expect(container.querySelector(".pres-label-no")?.textContent).toBe("false");
    expect(container.querySelector(".pres-count")?.textContent).toBe("2 / 3");
    act(() => useDiagram.getState().setPresentation({ step: 3 }));
    expect(container.querySelector(".pres-end-ok")?.textContent).toBe("End");
    unmount();
    act(() => useDiagram.getState().stopPresenting());
  });

  it("has KO, error and exception ends, and files keep them", () => {
    for (const t of ["ko", "error", "exception"] as const) {
      expect(registry[t].modes).toContain("flow");
      const d = importValue({ nodes: [block("x", 0, 0, t)], edges: [] });
      expect(d.nodes[0]!.type).toBe(t);
    }
  });

  it("renders the decision sign and the red ends", () => {
    act(() =>
      useDiagram.setState({
        diagram: {
          id: "d",
          name: "t",
          nodes: [
            block("q", 0, 0, "condition"),
            block("k", 6, 0, "ko"),
            block("x", 0, 6, "exception"),
          ],
          edges: [],
          viewport: { x: 1, y: 1, zoom: 1 },
        },
        selection: [],
        selectedEdge: null,
      }),
    );
    const { container } = render(<Canvas />);
    expect(container.querySelector(".decision-face")).toBeTruthy();
    expect(container.querySelector(".q-fill")).toBeTruthy();
    expect(container.querySelector(".alarm-text")?.textContent).toBe("KO");
    expect(container.querySelector(".alarm-bolt")).toBeTruthy();
    void project;
  });
});
