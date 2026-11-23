import type { Diagram, Node, Note, NoteColor } from "@/types/diagram";
import { project } from "./isometric";

/**
 * Notes: flat, hand-drawn cards that sit on the board like stickies on a whiteboard. A note
 * floats anywhere, or is attached to a block: then its `x, y` are relative to the block's
 * origin, so it travels with the block, and a line joins the two.
 */
export const NOTE_COLORS = ["yellow", "pink", "mint", "sky", "lavender", "paper"] as const;
export const NOTE_MIN = { w: 90, h: 56 };
export const NOTE_SIZE = { w: 220, h: 140 };
/** Where a new note goes relative to the block it's attached to: up and to the right. */
export const NEW_NOTE_OFFSET = { x: 70, y: -190 };
const FONT = 21,
  LINE = 25,
  PAD = 14;
export const HAND = `"Caveat", "Segoe Print", "Comic Sans MS", cursive`;

export interface Point {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where a note's line meets its block: the middle of the block's top. */
export const anchorOf = (n: Node): Point => {
  const p = project(n.gx, n.gy, n.gz);
  return { x: p.x, y: p.y - 26 };
};
const originOf = (n: Node) => project(n.gx, n.gy, n.gz);

/** The note's rectangle in canvas coordinates. */
export function noteRect(note: Note, nodes: Node[]): Rect {
  const host = note.attach ? nodes.find((n) => n.id === note.attach) : undefined;
  const o = host ? originOf(host) : { x: 0, y: 0 };
  return { x: note.x + o.x, y: note.y + o.y, w: note.w, h: note.h };
}

/** Where the note's line ends, in canvas coordinates (null when it has no line). */
export function pinPoint(note: Note, nodes: Node[]): Point | null {
  const host = note.attach ? nodes.find((n) => n.id === note.attach) : undefined;
  if (host) {
    if (!note.pin) return anchorOf(host);
    const o = originOf(host);
    return { x: o.x + note.pin.x, y: o.y + note.pin.y };
  }
  return note.pin ? { ...note.pin } : null;
}

/**
 * Stores a canvas rectangle on a note, relative to `attach` when given. `pin` is where its line
 * should end, in canvas coordinates: `null` for no fixed point (an attached note then points at
 * its block's top; a free one has no line), left out to keep the line where it ends now.
 */
export function placeNote(
  note: Note,
  rect: Rect,
  nodes: Node[],
  attach?: string,
  pin?: Point | null,
): Note {
  const host = attach ? nodes.find((n) => n.id === attach) : undefined;
  const o = host ? originOf(host) : { x: 0, y: 0 };
  // Pointing at the block's default spot stays that way while the note keeps its block.
  const keepDefault = pin === undefined && !note.pin && !!host && note.attach === host.id;
  const end = pin === undefined ? (keepDefault ? null : pinPoint(note, nodes)) : pin;
  const { attach: _old, pin: _pin, ...rest } = note;
  return {
    ...rest,
    ...(host ? { attach: host.id } : {}),
    ...(end ? { pin: { x: Math.round(end.x - o.x), y: Math.round(end.y - o.y) } } : {}),
    x: Math.round(rect.x - o.x),
    y: Math.round(rect.y - o.y),
    w: Math.round(rect.w),
    h: Math.round(rect.h),
  };
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** Resizes `r` by dragging `handle` by `d`, keeping the opposite side put and a minimum size. */
export function resizeRect(r: Rect, handle: Handle, d: Point): Rect {
  let { x, y, w, h } = r;
  if (handle.includes("e")) w = Math.max(NOTE_MIN.w, r.w + d.x);
  if (handle.includes("s")) h = Math.max(NOTE_MIN.h, r.h + d.y);
  if (handle.includes("w")) {
    w = Math.max(NOTE_MIN.w, r.w - d.x);
    x = r.x + r.w - w;
  }
  if (handle.includes("n")) {
    h = Math.max(NOTE_MIN.h, r.h - d.y);
    y = r.y + r.h - h;
  }
  return { x, y, w, h };
}

export function handlePoint(r: Rect, handle: Handle): Point {
  const x = handle.includes("w") ? r.x : handle.includes("e") ? r.x + r.w : r.x + r.w / 2;
  const y = handle.includes("n") ? r.y : handle.includes("s") ? r.y + r.h : r.y + r.h / 2;
  return { x, y };
}

/** Where the line from the note's centre towards `to` leaves the note (null if `to` is inside). */
export function edgePoint(r: Rect, to: Point): Point | null {
  const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const dx = to.x - c.x,
    dy = to.y - c.y;
  const t = Math.min(
    dx ? r.w / 2 / Math.abs(dx) : Infinity,
    dy ? r.h / 2 / Math.abs(dy) : Infinity,
  );
  if (t >= 1) return null;
  return { x: c.x + dx * t, y: c.y + dy * t };
}

// ── Text ──

/** Word-wraps one paragraph to `limit` (in the units `width` measures: characters by
 * default); words too long for a line are hyphenated. */
export function wrap(
  text: string,
  limit: number,
  indent = "",
  width: (s: string) => number = (s) => s.length,
): string[] {
  const out: string[] = [];
  let line = "";
  const fits = (s: string) => width(out.length ? indent + s : s) <= limit;
  for (let word of text.split(/\s+/).filter(Boolean)) {
    if (line && fits(`${line} ${word}`)) {
      line += ` ${word}`;
      continue;
    }
    if (line) out.push(line);
    while (!fits(word) && word.length > 2) {
      let k = word.length - 1;
      while (k > 1 && !fits(`${word.slice(0, k)}-`)) k--;
      out.push(`${word.slice(0, k)}-`);
      word = word.slice(k);
    }
    line = word;
  }
  if (line) out.push(line);
  return out.map((l, i) => (i ? indent + l : l));
}

// Notes are written in a handwriting font, which isn't monospaced: measure the real text in
// the browser, and fall back to an average glyph width where there's no canvas (tests, SSR).
let ctx: CanvasRenderingContext2D | null | undefined;
function measurer(): (s: string) => number {
  if (ctx === undefined)
    ctx =
      typeof document === "undefined" || /jsdom/.test(navigator.userAgent)
        ? null
        : document.createElement("canvas").getContext("2d");
  const estimate = (s: string) => s.length * FONT * 0.42;
  if (!ctx) return estimate;
  ctx.font = `500 ${FONT}px ${HAND}`;
  // A browser without usable fonts measures everything as 0 wide: estimate instead.
  if (!(ctx.measureText("note").width > 0)) return estimate;
  return (s) => ctx!.measureText(s).width;
}

/** The text lines that fit a note of this size, with an ellipsis when it runs over. */
export function noteLines(text: string, w: number, h: number) {
  const width = measurer();
  const room = w - 2 * PAD;
  const max = Math.max(1, Math.floor((h - 2 * PAD + (LINE - FONT)) / LINE));
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .flatMap((p) => {
      if (!p.trim()) return [""];
      const bullet = /^\s*[-*•]\s+/.exec(p);
      return bullet
        ? wrap(`• ${p.slice(bullet[0].length)}`, room, "   ", width)
        : wrap(p, room, "", width);
    });
  while (lines.length && !lines.at(-1)) lines.pop();
  if (lines.length <= max) return lines;
  const cut = lines.slice(0, max);
  let last = cut[max - 1]!;
  while (last && width(`${last}…`) > room) last = last.slice(0, -1);
  cut[max - 1] = `${last.trimEnd()}…`;
  return cut;
}
export const NOTE_TEXT = { font: FONT, line: LINE, pad: PAD };

// ── Hand-drawn strokes (deterministic per note, so they don't wobble between renders) ──

function random(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
const f = (v: number) => Math.round(v * 10) / 10;

/** One pencil stroke from a to b: slightly off at the ends and bowed in the middle. */
function stroke(a: Point, b: Point, rnd: () => number, wobble: number) {
  const j = () => (rnd() - 0.5) * wobble;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const bow = (rnd() - 0.5) * Math.min(9, len * 0.035);
  const nx = -(b.y - a.y) / len,
    ny = (b.x - a.x) / len;
  const mx = (a.x + b.x) / 2 + nx * bow + j(),
    my = (a.y + b.y) / 2 + ny * bow + j();
  return `M ${f(a.x + j())} ${f(a.y + j())} Q ${f(mx)} ${f(my)} ${f(b.x + j())} ${f(b.y + j())}`;
}

/** A sketchy rectangle: a slightly crooked fill and two loose pencil passes round it. */
export function roughRect(r: Rect, seed: string) {
  const rnd = random(seed);
  const o = (k = 4) => (rnd() - 0.5) * k;
  const c = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
  const fill = `M ${c.map((p) => `${f(p.x + o())} ${f(p.y + o())}`).join(" L ")} Z`;
  const lines: string[] = [];
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < 4; i++) {
      const a = c[i]!,
        b = c[(i + 1) % 4]!;
      // Overshoot the corners a touch, the way a quick hand does.
      const dx = Math.sign(b.x - a.x) * 4,
        dy = Math.sign(b.y - a.y) * 4;
      lines.push(
        stroke(
          { x: a.x - dx * rnd(), y: a.y - dy * rnd() },
          { x: b.x + dx * rnd(), y: b.y + dy * rnd() },
          rnd,
          4,
        ),
      );
    }
  return { fill, stroke: lines.join(" ") };
}

/** A sketchy line, drawn twice. */
export function roughLine(a: Point, b: Point, seed: string) {
  const rnd = random(seed);
  return `${stroke(a, b, rnd, 2)} ${stroke(a, b, rnd, 2.5)}`;
}

// ── Old price tags → notes ──

const TAG_COLOR: Record<string, NoteColor> = {
  kraft: "paper",
  paper: "paper",
  yellow: "yellow",
  pink: "pink",
  mint: "mint",
  sky: "sky",
};

/** Turns the old per-block price tags (`data.tag`) into attached notes. */
export function migrateTags(d: Diagram, id: () => string): Diagram {
  if (!d.nodes.some((n) => "tag" in n.data)) return d;
  const notes = [...(d.notes ?? [])];
  const nodes = d.nodes.map((n) => {
    if (!("tag" in n.data)) return n;
    const { tag, tagColor, tagAt, tagSize: _s, tagWidth, ...data } = n.data;
    if (typeof tag === "string" && tag.trim()) {
      const at = tagAt as Partial<Point> | undefined;
      const w = Number(tagWidth) || NOTE_SIZE.w;
      notes.push({
        id: id(),
        text: tag.trim(),
        color: TAG_COLOR[String(tagColor)] ?? "paper",
        attach: n.id,
        x: Math.round((Number(at?.x) || 190) - w / 2),
        y: Math.round(Number(at?.y) || -96),
        w,
        h: NOTE_SIZE.h,
      });
    }
    return { ...n, data };
  });
  return { ...d, nodes, notes };
}
