import { useEffect, useRef, useState } from "react";
import type React from "react";
import { useDiagram } from "@/store/diagram";
import { project } from "@/lib/isometric";
import {
  edgePoint,
  handlePoint,
  noteLines,
  noteRect,
  pinPoint,
  placeNote,
  resizeRect,
  roughLine,
  roughRect,
  HANDLES,
  NOTE_TEXT,
  HAND,
  type Handle,
  type Point,
  type Rect,
} from "@/lib/notes";
import type { Node, Note } from "@/types/diagram";

interface Props {
  nodes: Node[];
  notes: Note[];
  selected: string | null;
  presenting: boolean;
  zoom: number;
  editing: string | null;
  onEdit: (id: string | null) => void;
  /** Client → canvas coordinates. */
  toCanvas: (clientX: number, clientY: number) => Point;
  /** False while panning (Space held or the pan tool). */
  canDrag: () => boolean;
}

interface Drag {
  id: string;
  mode: "move" | "resize" | "link";
  handle?: Handle;
  start: Point;
  from: Rect;
  rect: Rect;
  pointer: Point;
  moved: boolean;
  /** While re-pointing: the block under the pointer, if any. */
  target?: Node | undefined;
}

/** The block under the pointer: whatever is drawn there, or (without hit testing, in tests)
 * the nearest block within reach. */
function blockUnder(nodes: Node[], clientX: number, clientY: number, p: Point) {
  if (typeof document.elementsFromPoint !== "function") return blockAt(nodes, p);
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const id = el.closest("[data-node-id]")?.getAttribute("data-node-id");
    if (id) return nodes.find((n) => n.id === id);
  }
  return undefined;
}
function blockAt(nodes: Node[], p: Point) {
  let best: Node | undefined,
    dist = 80;
  for (const n of nodes) {
    if (n.type === "zone") continue;
    const q = project(n.gx, n.gy, n.gz);
    const d = Math.hypot(q.x - p.x, q.y - 20 - p.y);
    if (d < dist) {
      best = n;
      dist = d;
    }
  }
  return best;
}

/** Flat, hand-drawn notes on top of the isometric board, each optionally tied to a block. */
export function NotesLayer({
  nodes,
  notes,
  selected,
  presenting,
  zoom,
  editing,
  onEdit,
  toCanvas,
  canDrag,
}: Props) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [text, setText] = useState("");
  const cancelled = useRef(false);
  const s = 1 / Math.max(0.4, zoom); // keep handles a steady size on screen
  // Text is measured in the handwriting font, so lay notes out again once it has loaded.
  const [, setFontReady] = useState(0);
  useEffect(() => {
    let live = true;
    document.fonts
      ?.load(`500 ${NOTE_TEXT.font}px ${HAND}`)
      .then(() => live && setFontReady((n) => n + 1))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  // Start each edit from the note's current text.
  useEffect(() => {
    if (editing) setText(notes.find((n) => n.id === editing)?.text ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  function begin(
    e: React.PointerEvent<SVGElement>,
    note: Note,
    mode: Drag["mode"],
    handle?: Handle,
  ) {
    if (presenting || e.button !== 0 || !canDrag()) return;
    e.stopPropagation();
    useDiagram.getState().selectNote(note.id);
    const r = noteRect(note, nodes);
    const p = toCanvas(e.clientX, e.clientY);
    setDrag({
      id: note.id,
      mode,
      ...(handle ? { handle } : {}),
      start: p,
      from: r,
      rect: r,
      pointer: p,
      moved: false,
    });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }
  function move(e: React.PointerEvent) {
    if (!drag) return;
    const p = toCanvas(e.clientX, e.clientY);
    const d = { x: p.x - drag.start.x, y: p.y - drag.start.y };
    const rect =
      drag.mode === "move"
        ? { ...drag.from, x: drag.from.x + d.x, y: drag.from.y + d.y }
        : drag.mode === "resize" && drag.handle
          ? resizeRect(drag.from, drag.handle, d)
          : drag.from;
    setDrag({
      ...drag,
      rect,
      pointer: p,
      moved: drag.moved || Math.hypot(d.x, d.y) > 2,
      ...(drag.mode === "link" ? { target: blockUnder(nodes, e.clientX, e.clientY, p) } : {}),
    });
  }
  function end() {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!d.moved) return;
    const s = useDiagram.getState();
    const note = s.diagram.notes?.find((n) => n.id === d.id);
    if (!note) return;
    // Re-pointing pins the line's end exactly where it was dropped: on a block (it then sticks
    // to that spot, and the note travels with the block) or on the board.
    const next =
      d.mode === "link"
        ? placeNote(note, d.rect, s.diagram.nodes, d.target?.id, d.pointer)
        : placeNote(note, d.rect, s.diagram.nodes, note.attach);
    s.commit((diagram) => ({
      ...diagram,
      notes: (diagram.notes ?? []).map((n) => (n.id === d.id ? next : n)),
    }));
    if (d.mode === "link")
      s.notify(
        d.target
          ? `Note pinned to ${d.target.label || "the block"}: it moves with it.`
          : "Note pinned to the board.",
      );
  }
  function save(note: Note, value: string, next?: EventTarget | null) {
    onEdit(null);
    const s = useDiagram.getState();
    // Moving on to the note's text box in the inspector: keep the note, it's being written
    // there (an empty one is cleared away once something else is selected).
    if (
      !cancelled.current &&
      !value.trim() &&
      next instanceof Element &&
      next.closest(".note-panel")
    )
      return;
    if (cancelled.current) {
      cancelled.current = false;
      if (note.text.trim()) return;
    } else if (value.trim() && value !== note.text) {
      s.updateNote(note.id, { text: value.replace(/\s+$/, "") });
      return;
    } else if (value.trim()) return;
    // An empty note is thrown away, like an empty text box on a whiteboard.
    s.commit((d) => ({ ...d, notes: (d.notes ?? []).filter((n) => n.id !== note.id) }));
    s.selectNote(null);
  }

  const placed = notes.map((note) => ({
    note,
    rect: drag?.id === note.id ? drag.rect : noteRect(note, nodes),
  }));
  const linking = drag?.mode === "link" ? drag : null;

  return (
    <g className="notes-layer" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      {/* Lines first, so every note sits on top of every line. */}
      {placed.map(({ note, rect }) => {
        const live = linking?.id === note.id && linking.moved;
        const pin = live ? linking.pointer : pinPoint(note, nodes);
        if (!pin) return null;
        const p = edgePoint(rect, pin);
        const onBlock = live ? !!linking.target : !!note.attach;
        return (
          <g key={note.id} className={`note-link ${live ? "note-ui note-linking" : ""}`}>
            {p && (
              <>
                <path className="note-link-halo" d={`M ${p.x} ${p.y} L ${pin.x} ${pin.y}`} />
                <path
                  className="note-link-line"
                  d={live ? `M ${p.x} ${p.y} L ${pin.x} ${pin.y}` : roughLine(p, pin, note.id)}
                />
              </>
            )}
            <circle
              className={`note-link-dot ${onBlock ? "dot-on-block" : "dot-on-board"}`}
              cx={pin.x}
              cy={pin.y}
              r={selected === note.id && !presenting ? 7 : 5}
              onPointerDown={(e) => begin(e, note, "link")}
            >
              <title>
                Drag to point this note somewhere else: a spot on a block, or on the board
              </title>
            </circle>
          </g>
        );
      })}
      {linking?.moved && linking.target && (
        <ellipse
          className="note-ui note-target"
          cx={project(linking.target.gx, linking.target.gy, linking.target.gz).x}
          cy={project(linking.target.gx, linking.target.gy, linking.target.gz).y}
          rx="70"
          ry="36"
        />
      )}
      {placed.map(({ note, rect }) => {
        const rough = roughRect(rect, note.id);
        const lines = editing === note.id ? [] : noteLines(note.text, rect.w, rect.h);
        const isSel = selected === note.id && !presenting;
        return (
          <g
            key={note.id}
            className={`diagram-note note-${note.color} ${isSel ? "note-selected" : ""}`}
            onPointerDown={(e) => begin(e, note, "move")}
            onDoubleClick={(e) => {
              if (presenting) return;
              e.stopPropagation();
              onEdit(note.id);
            }}
          >
            <path className="note-shadow" d={rough.fill} transform="translate(3 4)" />
            <path className="note-fill" d={rough.fill} />
            <path className="note-stroke" d={rough.stroke} />
            {lines.map((l, i) => (
              <text
                key={i}
                className="note-text"
                x={rect.x + NOTE_TEXT.pad}
                y={rect.y + NOTE_TEXT.pad + NOTE_TEXT.font - 2 + i * NOTE_TEXT.line}
              >
                {l}
              </text>
            ))}
            {editing === note.id && (
              <foreignObject x={rect.x} y={rect.y} width={rect.w} height={rect.h}>
                <textarea
                  autoFocus
                  className="note-editor"
                  aria-label="Note text"
                  placeholder="Write a note…"
                  value={text}
                  title="Ctrl Enter or click away to save · Esc cancels"
                  onChange={(e) => setText(e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onBlur={(e) => save(note, e.target.value, e.relatedTarget)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.blur();
                    if (e.key === "Escape") {
                      cancelled.current = true;
                      e.currentTarget.blur();
                    }
                  }}
                />
              </foreignObject>
            )}
          </g>
        );
      })}
      {placed.map(({ note, rect }) => {
        if (selected !== note.id || presenting || editing === note.id) return null;
        const pad = 6 * s;
        const link = { x: rect.x + rect.w / 2, y: rect.y - 26 * s };
        return (
          <g key={note.id} className="note-ui">
            <rect
              className="note-frame"
              x={rect.x - pad}
              y={rect.y - pad}
              width={rect.w + 2 * pad}
              height={rect.h + 2 * pad}
              strokeWidth={1.5 * s}
            />
            <line
              className="note-frame"
              x1={link.x}
              y1={rect.y - pad}
              x2={link.x}
              y2={link.y}
              strokeWidth={1.5 * s}
            />
            <g
              className="note-link-handle"
              transform={`translate(${link.x} ${link.y}) scale(${s})`}
              onPointerDown={(e) => begin(e, note, "link")}
            >
              <title>Drag to point this note at any spot: on a block, or on the board</title>
              <circle r="11" />
              <path d="M -4 -1 a 3 3 0 0 1 3 -3 h 2 M 4 1 a 3 3 0 0 1 -3 3 h -2 M -2 2 L 2 -2" />
            </g>
            {HANDLES.map((h) => {
              const p = handlePoint(
                { x: rect.x - pad, y: rect.y - pad, w: rect.w + 2 * pad, h: rect.h + 2 * pad },
                h,
              );
              return (
                <rect
                  key={h}
                  className={`note-handle handle-${h}`}
                  x={p.x - 5 * s}
                  y={p.y - 5 * s}
                  width={10 * s}
                  height={10 * s}
                  rx={2.5 * s}
                  strokeWidth={1.5 * s}
                  onPointerDown={(e) => begin(e, note, "resize", h)}
                />
              );
            })}
          </g>
        );
      })}
    </g>
  );
}
