import { act, fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Canvas } from "@/components/isoboard/Canvas";
import { Inspector } from "@/components/isoboard/Inspector";
import { useDiagram } from "@/store/diagram";
import { readTag, tagShape, TAG_HOME, TAG_PIN } from "@/lib/tags";
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
      block({ tag: " $9 \n\n small \n a\n b", tagColor: "nope", tagAt: { x: "x" } }),
    );
    expect(t).toEqual({ lines: ["$9", "small", "a"], color: "kraft", at: TAG_HOME });
    expect(readTag(block({ tag: "x".repeat(50) }))!.lines[0]).toHaveLength(30);
  });

  it("points the tag back at its pin on either side", () => {
    const right = tagShape(["$9"], { x: TAG_PIN.x + 40, y: TAG_PIN.y + 20 });
    const left = tagShape(["$9"], { x: TAG_PIN.x - 40, y: TAG_PIN.y + 20 });
    expect(right.side).toBe(1);
    expect(left.side).toBe(-1);
    expect(right.tilt).toBeGreaterThan(0);
    expect(left.tilt).toBe(-right.tilt);
    // Text sits on the body, past the eyelet, whichever way the tag hangs.
    expect(right.text[0]!.x).toBeGreaterThan(0);
    expect(left.text[0]!.x).toBeLessThan(0);
    expect(tagShape(["a", "b"], TAG_HOME).height).toBeGreaterThan(tagShape(["a"], TAG_HOME).height);
  });

  it("T hangs a tag on the selected block; Enter saves, empty removes", () => {
    const { container } = render(<Canvas />);
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "t" })));
    const editor = container.querySelector("textarea")!;
    expect(editor).toBeTruthy();
    fireEvent.change(editor, { target: { value: "$12 / month\n2 vCPU" } });
    fireEvent.keyDown(editor, { key: "Enter" });
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

  it("the inspector recolours, re-hangs and removes a tag", () => {
    load(block({ tag: "$9", tagAt: { x: 1, y: 2 } }));
    const { getByLabelText, getByText } = render(<Inspector />);
    fireEvent.click(getByLabelText("pink tag"));
    expect(data()["tagColor"]).toBe("pink");
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
