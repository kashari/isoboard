import { act, fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Canvas } from "@/components/isoboard/Canvas";
import { Inspector } from "@/components/isoboard/Inspector";
import { useDiagram } from "@/store/diagram";
import {
  edgePoint,
  migrateTags,
  noteLines,
  noteRect,
  pinPoint,
  placeNote,
  resizeRect,
  wrap,
  NEW_NOTE_OFFSET,
  NOTE_MIN,
} from "@/lib/notes";
import { project } from "@/lib/isometric";
import { importValue } from "@/lib/import-diagram";
import { buildSpec } from "@/lib/spec";
import type { Diagram, Node, Note } from "@/types/diagram";

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

const block = (id: string, gx: number, gy = 0): Node => ({
  id,
  type: "service",
  gx,
  gy,
  gz: 0,
  label: id.toUpperCase(),
  sublabel: "",
  color: "blue",
  icon: "Server",
  data: {},
});
const note = (patch: Partial<Note> = {}): Note => ({
  id: "n1",
  text: "Hello",
  x: 0,
  y: 0,
  w: 200,
  h: 120,
  color: "yellow",
  ...patch,
});
const load = (notes: Note[], nodes = [block("a", 0), block("b", 8)]) =>
  act(() =>
    useDiagram.setState({
      // A non-zero viewport keeps the canvas at zoom 1 (no fit on mount).
      diagram: { id: "d", name: "t", nodes, edges: [], notes, viewport: { x: 1, y: 1, zoom: 1 } },
      selection: [],
      selectedEdge: null,
      selectedNote: null,
      past: [],
      future: [],
      presentation: null,
    }),
  );
const notes = () => useDiagram.getState().diagram.notes ?? [];
const drag = (el: Element, svg: Element, dx: number, dy: number) => {
  fireEvent.pointerDown(el, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(el, { clientX: 100 + dx, clientY: 100 + dy });
  fireEvent.pointerUp(el, { clientX: 100 + dx, clientY: 100 + dy });
  void svg;
};

describe("note geometry", () => {
  it("resizes from any side or corner, keeping the far side and a minimum size", () => {
    const r = { x: 0, y: 0, w: 200, h: 100 };
    expect(resizeRect(r, "se", { x: 30, y: 40 })).toEqual({ x: 0, y: 0, w: 230, h: 140 });
    expect(resizeRect(r, "nw", { x: 20, y: 10 })).toEqual({ x: 20, y: 10, w: 180, h: 90 });
    expect(resizeRect(r, "n", { x: 99, y: -50 })).toEqual({ x: 0, y: -50, w: 200, h: 150 });
    expect(resizeRect(r, "w", { x: 500, y: 0 })).toEqual({
      x: 200 - NOTE_MIN.w,
      y: 0,
      w: NOTE_MIN.w,
      h: 100,
    });
  });

  it("finds where the link leaves the note", () => {
    const r = { x: 0, y: 0, w: 100, h: 50 };
    expect(edgePoint(r, { x: 50, y: 200 })).toEqual({ x: 50, y: 50 });
    expect(edgePoint(r, { x: 300, y: 25 })).toEqual({ x: 100, y: 25 });
    expect(edgePoint(r, { x: 40, y: 20 })).toBeNull();
  });

  it("wraps text to the note, bullets and all, and cuts it off with an ellipsis", () => {
    expect(wrap("the quick brown fox", 9)).toEqual(["the quick", "brown fox"]);
    expect(wrap("abcdefghij", 5)).toEqual(["abcd-", "efgh-", "ij"]);
    const lines = noteLines("Title\n- one two three four five six", 140, 400);
    expect(lines[0]).toBe("Title");
    expect(lines[1]!.startsWith("• one")).toBe(true);
    expect(lines.slice(2).every((l) => l.startsWith("  "))).toBe(true);
    const short = noteLines("a\nb\nc\nd\ne\nf", 200, 80);
    expect(short.length).toBeLessThan(6);
    expect(short.at(-1)!.endsWith("…")).toBe(true);
  });

  it("an attached note is stored relative to its block and moves with it", () => {
    const a = block("a", 0);
    const n = placeNote(note(), { x: 300, y: 50, w: 200, h: 120 }, [a], "a");
    const o = project(0, 0, 0);
    expect(n).toMatchObject({ attach: "a", x: 300 - o.x, y: 50 - o.y });
    const moved = { ...a, gx: 3 };
    const q = project(3, 0, 0);
    expect(noteRect(n, [moved])).toMatchObject({ x: n.x + q.x, y: n.y + q.y });
    // Detaching keeps it where it is.
    expect(noteRect(placeNote(n, noteRect(n, [a]), [a]), [a])).toEqual(noteRect(n, [a]));
  });

  it("turns old price tags into attached notes", () => {
    const d: Diagram = {
      id: "d",
      name: "t",
      nodes: [{ ...block("a", 0), data: { port: "1", tag: "Costs\n$9", tagColor: "kraft" } }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    const m = migrateTags(d, () => "new");
    expect(m.nodes[0]!.data).toEqual({ port: "1" });
    expect(m.notes).toEqual([
      expect.objectContaining({ id: "new", text: "Costs\n$9", color: "paper", attach: "a" }),
    ]);
  });
});

describe("notes in files and specs", () => {
  it("imports notes leniently and frees notes whose block is missing", () => {
    const d = importValue({
      id: "d",
      name: "t",
      nodes: [block("a", 0)],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      notes: [
        { id: "1", text: "ok", x: "10", y: 5, w: 10, h: 300, color: "neon", attach: "a" },
        { id: "2", text: "lost", x: 0, y: 0, w: 200, h: 100, color: "pink", attach: "zzz" },
        { id: "3", text: "pinned", x: 0, y: 0, w: 200, h: 100, pin: { x: 7, y: 8 } },
        { id: "4", text: "bad pin", x: 0, y: 0, w: 200, h: 100, pin: { x: "?" } },
        "junk",
      ],
    });
    expect(d.notes).toHaveLength(4);
    expect(d.notes![2]!.pin).toEqual({ x: 7, y: 8 });
    expect(d.notes![3]!.pin).toBeUndefined();
    expect(d.notes![0]).toMatchObject({ x: 10, w: NOTE_MIN.w, h: 300, color: "yellow" });
    expect(d.notes![1]!.attach).toBeUndefined();
  });

  it("specs attach notes to blocks", () => {
    const built = buildSpec({
      nodes: [{ id: "a", type: "service", note: "Hi", noteColor: "mint", noteSize: [300, 200] }],
    });
    expect(built.diagram!.notes).toEqual([
      expect.objectContaining({ text: "Hi", color: "mint", attach: "a", w: 300, h: 200 }),
    ]);
    expect(
      buildSpec({ nodes: [{ id: "a", type: "service", tag: "old" }] }).diagram!.notes,
    ).toHaveLength(1);
    const bad = buildSpec({ nodes: [{ id: "a", type: "service", note: "x", noteColor: "gold" }] });
    expect(bad.errors.join()).toMatch(/noteColor/);
  });
});

describe("notes on the canvas", () => {
  beforeEach(() => load([]));

  it("N adds a note tied to the selected block and opens it for typing; empty ones vanish", () => {
    act(() => useDiagram.getState().select(["a"]));
    const { container } = render(<Canvas />);
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "n" })));
    expect(notes()).toEqual([expect.objectContaining({ attach: "a", ...NEW_NOTE_OFFSET })]);
    const editor = container.querySelector("textarea")!;
    fireEvent.change(editor, { target: { value: "Remember\nthe milk" } });
    fireEvent.keyDown(editor, { key: "Enter" }); // plain Enter is a new line
    fireEvent.keyDown(editor, { key: "Enter", ctrlKey: true });
    fireEvent.blur(editor);
    expect(notes()[0]!.text).toBe("Remember\nthe milk");
    expect(container.querySelectorAll(".note-text")).toHaveLength(2);
    expect(container.querySelector(".note-link-line")).toBeTruthy();

    // A new note left empty is thrown away.
    act(() => useDiagram.getState().selectNote(null));
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "n" })));
    expect(notes()).toHaveLength(2);
    fireEvent.blur(container.querySelector("textarea")!);
    expect(notes()).toHaveLength(1);
  });

  it("double-clicking the empty board drops a free note there", () => {
    const { container } = render(<Canvas />);
    fireEvent.doubleClick(container.querySelector("svg.diagram-canvas")!, {
      clientX: 400,
      clientY: 300,
    });
    expect(notes()).toHaveLength(1);
    expect(notes()[0]!.attach).toBeUndefined();
  });

  it("moves, resizes from any handle and re-links by dragging", () => {
    load([note({ x: 500, y: 0 })]);
    const { container } = render(<Canvas />);
    const svg = container.querySelector("svg.diagram-canvas")!;
    drag(container.querySelector(".diagram-note")!, svg, 30, 20);
    expect(notes()[0]).toMatchObject({ x: 530, y: 20, w: 200, h: 120 });
    expect(useDiagram.getState().selectedNote).toBe("n1");

    drag(container.querySelector(".handle-s")!, svg, 50, 60);
    expect(notes()[0]).toMatchObject({ x: 530, y: 20, w: 200, h: 180 });
    drag(container.querySelector(".handle-nw")!, svg, -40, -10);
    expect(notes()[0]).toMatchObject({ x: 490, y: 10, w: 240, h: 190 });

    // Drag the link handle onto a spot on block B: the line ends exactly there, the note is
    // tied to B but stays put.
    const nodes = () => useDiagram.getState().diagram.nodes;
    const before = noteRect(notes()[0]!, nodes());
    const b = project(8, 0, 0);
    // The canvas maps client (x, y) to canvas (x - 1, y - 1) at this viewport.
    const spot = { x: b.x + 12, y: b.y - 30 };
    const handle = container.querySelector(".note-link-handle")!;
    fireEvent.pointerDown(handle, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(handle, { clientX: spot.x + 1, clientY: spot.y + 1 });
    fireEvent.pointerUp(handle, { clientX: spot.x + 1, clientY: spot.y + 1 });
    expect(notes()[0]).toMatchObject({ attach: "b", pin: { x: 12, y: -30 } });
    expect(pinPoint(notes()[0]!, nodes())).toEqual(spot);
    expect(noteRect(notes()[0]!, nodes())).toEqual(before);

    // Moving the block carries the note and the pinned spot with it.
    act(() => useDiagram.getState().updateNode("b", { gx: 10 }));
    const b2 = project(10, 0, 0);
    expect(pinPoint(notes()[0]!, nodes())).toEqual({ x: b2.x + 12, y: b2.y - 30 });

    // Drag the dot itself onto empty board: pinned there, the note floats free.
    const placedAt = noteRect(notes()[0]!, nodes());
    const dot = container.querySelector(".note-link-dot")!;
    fireEvent.pointerDown(dot, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(dot, { clientX: -299, clientY: 401 });
    fireEvent.pointerUp(dot, { clientX: -299, clientY: 401 });
    expect(notes()[0]!.attach).toBeUndefined();
    expect(pinPoint(notes()[0]!, nodes())).toEqual({ x: -300, y: 400 });
    expect(noteRect(notes()[0]!, nodes())).toEqual(placedAt); // the note itself didn't move
    expect(container.querySelector(".note-link-line")).toBeTruthy();

    act(() => useDiagram.getState().undo());
    expect(notes()[0]!.attach).toBe("b");
  });

  it("the line's end stays put when the note moves, and moves with a block it's pinned to", () => {
    const a = block("a", 0);
    const free = placeNote(note(), { x: 0, y: 0, w: 200, h: 100 }, [a], undefined, {
      x: 500,
      y: 9,
    });
    expect(free.pin).toEqual({ x: 500, y: 9 });
    const moved = placeNote(free, { x: 40, y: 40, w: 200, h: 100 }, [a], undefined);
    expect(pinPoint(moved, [a])).toEqual({ x: 500, y: 9 });
    // An attached note without a pin points at its block's top, and keeps doing so.
    const tied = placeNote(note(), { x: 0, y: 0, w: 200, h: 100 }, [a], "a", null);
    expect(tied.pin).toBeUndefined();
    expect(placeNote(tied, { x: 9, y: 9, w: 200, h: 100 }, [a], "a").pin).toBeUndefined();
    // Freed (its block deleted), it keeps pointing where the block was.
    const freed = placeNote(tied, noteRect(tied, [a]), [a]);
    expect(pinPoint(freed, [])).toEqual(pinPoint(tied, [a]));
  });

  it("deleting a block frees its notes; Delete removes a selected note", () => {
    load([note({ attach: "a", x: 50, y: -100 })]);
    const where = noteRect(notes()[0]!, useDiagram.getState().diagram.nodes);
    act(() => useDiagram.getState().select(["a"]));
    act(() => useDiagram.getState().remove());
    expect(notes()[0]!.attach).toBeUndefined();
    expect(noteRect(notes()[0]!, [])).toEqual(where);
    act(() => useDiagram.getState().selectNote("n1"));
    act(() => useDiagram.getState().remove());
    expect(notes()).toHaveLength(0);
  });

  it("the inspector edits text, colour and what the note is tied to", () => {
    load([note({ x: 300, y: 40 })]);
    act(() => useDiagram.getState().selectNote("n1"));
    const { getByLabelText, getByText } = render(<Inspector />);
    fireEvent.change(getByLabelText("Note text"), { target: { value: "Changed" } });
    fireEvent.click(getByLabelText("pink note"));
    const before = noteRect(notes()[0]!, useDiagram.getState().diagram.nodes);
    fireEvent.change(getByLabelText("Attached to"), { target: { value: "a" } });
    expect(notes()[0]).toMatchObject({ text: "Changed", color: "pink", attach: "a" });
    expect(noteRect(notes()[0]!, useDiagram.getState().diagram.nodes)).toEqual(before);
    fireEvent.click(getByText("Remove line"));
    expect(notes()[0]!.attach).toBeUndefined();
    expect(pinPoint(notes()[0]!, [])).toBeNull();
  });
});
