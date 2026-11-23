import { act, fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Canvas } from "@/components/isoboard/Canvas";
import { Inspector } from "@/components/isoboard/Inspector";
import { useDiagram } from "@/store/diagram";
import {
  readTag,
  tagShape,
  wrap,
  TAG_HOME,
  TAG_PIN,
  TAG_WIDTH,
  TAG_MIN_W,
  TAG_MAX_W,
} from "@/lib/tags";
import { buildSpec } from "@/lib/spec";
import type { Node } from "@/types/diagram";

// d3-zoom measures the svg through width/height.baseVal, which jsdom leaves out.
for (const key of ["width", "height"])
  if (!(key in SVGSVGElement.prototype))
    Object.defineProperty(SVGSVGElement.prototype, key, {
      get: () => ({ baseVal: { value: 800 } }),
    });

// jsdom has no PointerEvent; a MouseEvent carries the button and coordinates we need.
if (!("PointerEvent" in window))
  Object.defineProperty(window, "PointerEvent", {
    value: class extends MouseEvent {
      pointerId = 1;
    },
  });

const block = (data: Record<string, unknown> = {}): Node => ({
  id: "a",
  type: "service",
  gx: 0,
  gy: 0,
  gz: 0,
  label: "API",
  sublabel: "",
  color: "blue",
  icon: "Server",
  data,
});
const load = (node: Node) =>
  act(() =>
    useDiagram.setState({
      diagram: { id: "d", name: "t", nodes: [node], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      selection: [node.id],
      selectedEdge: null,
      past: [],
      future: [],
      presentation: null,
    }),
  );
const data = () => useDiagram.getState().diagram.nodes[0]!.data;

describe("price tags", () => {
  beforeEach(() => load(block()));

  it("reads tags leniently", () => {
    expect(readTag(block())).toBeNull();
    expect(readTag(block({ tag: "   " }))).toBeNull();
    const t = readTag(
      block({
        tag: "\n $9 / month \n\nFirst para\n\n- a\n\n",
        tagColor: "nope",
        tagSize: "xl",
        tagAt: { x: "x" },
      }),
    );
    expect(t).toEqual({
      head: "$9 / month",
      body: ["First para", "", "- a"],
      color: "kraft",
      size: "m",
      at: TAG_HOME,
    });
  });

  it("wraps words, hyphenates long ones and indents bullets", () => {
    expect(wrap("the quick brown fox jumps", 10)).toEqual(["the quick", "brown fox", "jumps"]);
    expect(wrap("abcdefghijkl", 5)).toEqual(["abcd-", "efgh-", "ijkl"]);
    expect(wrap("• one two three", 8, "  ")).toEqual(["• one", "  two", "  three"]);
  });

  it("lays out a big note: wider sizes, taller with more text, bullets, capped", () => {
    const base = { head: "Costs", body: [], size: "m" as const, at: TAG_HOME };
    const plain = tagShape(base);
    expect(plain.width).toBe(120); // a short headline alone gets a snug card
    expect(tagShape({ ...base, head: "h".repeat(40) }).width).toBe(TAG_WIDTH.m);
    expect(plain.rule).toBe("");
    const note = tagShape({ ...base, body: ["a ".repeat(80), "- bullet"] });
    expect(note.height).toBeGreaterThan(plain.height + 80);
    expect(note.rule).not.toBe("");
    expect(note.text.some((t) => t.s.startsWith("• bullet"))).toBe(true);
    // Every line fits inside the card.
    const chars = Math.floor((TAG_WIDTH.m - 40) / (13.5 * 0.6));
    expect(note.text.every((t) => t.s.length <= chars)).toBe(true);
    expect(tagShape({ ...base, body: ["x"], size: "l" }).width).toBe(TAG_WIDTH.l);
    const huge = tagShape({ ...base, body: Array.from({ length: 50 }, (_, i) => `line ${i}`) });
    expect(huge.text.filter((t) => !t.head)).toHaveLength(18);
    expect(huge.text.at(-1)!.s.endsWith("…")).toBe(true);
    // The card swings slightly away from its pin.
    expect(tagShape({ ...base, at: { x: TAG_PIN.x + 200, y: 0 } }).tilt).toBeLessThan(0);
    expect(tagShape({ ...base, at: { x: TAG_PIN.x - 200, y: 0 } }).tilt).toBeGreaterThan(0);
  });

  it("T hangs a tag on the selected block; Ctrl Enter saves, empty removes", () => {
    const { container } = render(<Canvas />);
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "t" })));
    const editor = container.querySelector("textarea")!;
    expect(editor).toBeTruthy();
    fireEvent.change(editor, { target: { value: "$12 / month\n2 vCPU" } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(document.activeElement).toBe(editor); // plain Enter is a new line
    fireEvent.keyDown(editor, { key: "Enter", ctrlKey: true });
    fireEvent.blur(editor);
    expect(data()["tag"]).toBe("$12 / month\n2 vCPU");
    expect(container.querySelectorAll(".price-tag")).toHaveLength(1);
    expect(container.querySelector(".tag-head")?.textContent).toBe("$12 / month");

    fireEvent.doubleClick(container.querySelector(".tag-card")!);
    const again = container.querySelector("textarea")!;
    fireEvent.change(again, { target: { value: "  " } });
    fireEvent.blur(again);
    expect(data()["tag"]).toBeUndefined();
    expect(container.querySelector(".price-tag")).toBeNull();
  });

  it("Escape cancels an edit", () => {
    load(block({ tag: "keep" }));
    const { container } = render(<Canvas />);
    fireEvent.doubleClick(container.querySelector(".tag-card")!);
    const editor = container.querySelector("textarea")!;
    fireEvent.change(editor, { target: { value: "changed" } });
    fireEvent.keyDown(editor, { key: "Escape" });
    fireEvent.blur(editor);
    expect(data()["tag"]).toBe("keep");
  });

  it("drags a tag to a new spot, undoably", () => {
    load(block({ tag: "$9" }));
    const { container } = render(<Canvas />);
    const svg = container.querySelector("svg.diagram-canvas")!;
    fireEvent.pointerDown(container.querySelector(".tag-card")!, {
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(svg, { clientX: 130, clientY: 90 });
    fireEvent.pointerUp(svg, { clientX: 130, clientY: 90 });
    // Moved right and up by the pointer's motion, at whatever zoom the canvas fitted to.
    const at = data()["tagAt"] as { x: number; y: number };
    expect(at.x - TAG_HOME.x).toBeGreaterThan(0);
    expect((at.y - TAG_HOME.y) / (at.x - TAG_HOME.x)).toBeCloseTo(-1 / 3, 1);
    act(() => useDiagram.getState().undo());
    expect(data()["tagAt"]).toBeUndefined();
  });

  it("resizes a card by its corner grip: wider, clamped, re-wrapped, undoable", () => {
    load(block({ tag: "Note\n" + "word ".repeat(40) }));
    const { container } = render(<Canvas />);
    const svg = container.querySelector("svg.diagram-canvas")!;
    const lines = () => container.querySelectorAll(".tag-small").length;
    const before = lines();
    const zoom = () => useDiagram.getState().diagram.viewport.zoom;
    const grip = container.querySelector(".tag-resize")!;
    fireEvent.pointerDown(grip, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(svg, { clientX: 100 + 40 * zoom(), clientY: 100 });
    expect(lines()).toBeLessThan(before); // re-wraps live while dragging
    fireEvent.pointerUp(svg, { clientX: 100 + 40 * zoom(), clientY: 100 });
    expect(data()["tagAt"]).toBeUndefined(); // resizing doesn't move it
    expect(data()["tagWidth"]).toBeCloseTo(TAG_WIDTH.m + 80, -1);

    fireEvent.pointerDown(container.querySelector(".tag-resize")!, {
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(svg, { clientX: -5000, clientY: 0 });
    fireEvent.pointerUp(svg, { clientX: -5000, clientY: 0 });
    expect(data()["tagWidth"]).toBe(TAG_MIN_W);
    act(() => useDiagram.getState().undo());
    expect(data()["tagWidth"]).toBeCloseTo(TAG_WIDTH.m + 80, -1);
    expect(readTag(block({ tag: "x", tagWidth: 9999 }))!.width).toBe(TAG_MAX_W);
  });

  it("the inspector recolours, re-hangs and removes a tag", () => {
    load(block({ tag: "$9", tagAt: { x: 1, y: 2 } }));
    const { getByLabelText, getByText } = render(<Inspector />);
    fireEvent.click(getByLabelText("pink tag"));
    expect(data()["tagColor"]).toBe("pink");
    act(() => useDiagram.getState().updateNode("a", { data: { ...data(), tagWidth: 300 } }));
    fireEvent.click(getByText("Large"));
    expect(data()["tagSize"]).toBe("l");
    expect(data()["tagWidth"]).toBeUndefined(); // a preset replaces a dragged width
    fireEvent.click(getByText("Re-hang"));
    expect(data()["tagAt"]).toBeUndefined();
    fireEvent.click(getByText("Remove tag"));
    expect(data()).toEqual({});
  });

  it("specs can hang tags", () => {
    const built = buildSpec({
      nodes: [{ id: "a", type: "service", tag: "$9 / mo", tagColor: "mint" }],
    });
    expect(built.diagram!.nodes[0]!.data).toMatchObject({ tag: "$9 / mo", tagColor: "mint" });
    const bad = buildSpec({ nodes: [{ id: "a", type: "service", tag: "x", tagColor: "gold" }] });
    expect(bad.errors.join()).toMatch(/tagColor/);
  });
});
