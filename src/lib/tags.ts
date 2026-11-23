import type { Node } from "@/types/diagram";

/**
 * Price tags: a note card hung on a block by a string, like the tag on a coat. Stored in the
 * node's data:
 * - `tag`: the text. The first line is the headline; the rest is the note, wrapped to the
 *   card. Lines starting with "- " or "* " become bullets.
 * - `tagColor`: one of TAG_COLORS.
 * - `tagSize`: one of TAG_SIZES (card width).
 * - `tagWidth`: a card width set by dragging the resize grip; overrides `tagSize`.
 * - `tagAt`: where the card's eyelet hangs, in canvas pixels relative to the block's origin.
 */
export const TAG_COLORS = ["kraft", "paper", "yellow", "pink", "mint", "sky"] as const;
export type TagColor = (typeof TAG_COLORS)[number];
export const TAG_SIZES = ["s", "m", "l"] as const;
export type TagSize = (typeof TAG_SIZES)[number];
export const TAG_WIDTH: Record<TagSize, number> = { s: 180, m: 250, l: 340 };
export const TAG_MIN_W = 140,
  TAG_MAX_W = 480;
export const clampTagWidth = (w: number) => Math.round(Math.max(TAG_MIN_W, Math.min(TAG_MAX_W, w)));
/** Where the string is pinned on the block, and where the card hangs by default. */
export const TAG_PIN = { x: 34, y: -24 };
export const TAG_HOME = { x: 190, y: -96 };

export interface Point {
  x: number;
  y: number;
}
export interface TagInfo {
  head: string;
  body: string[];
  color: TagColor;
  size: TagSize;
  /** A width set by hand (resize grip), in canvas px. */
  width?: number;
  at: Point;
}

export function readTag(node: Node): TagInfo | null {
  const raw = node.data["tag"];
  if (typeof raw !== "string" || !raw.trim()) return null;
  const lines = raw.replace(/\r/g, "").split("\n");
  const first = lines.findIndex((l) => l.trim());
  const body = lines.slice(first + 1).map((l) => l.trimEnd());
  while (body.length && !body[0]!.trim()) body.shift();
  while (body.length && !body.at(-1)!.trim()) body.pop();
  const c = node.data["tagColor"],
    z = node.data["tagSize"];
  const at = node.data["tagAt"] as Partial<Point> | undefined;
  const ok = at && Number.isFinite(at.x) && Number.isFinite(at.y);
  const w = Number(node.data["tagWidth"]);
  return {
    head: lines[first]!.trim(),
    body,
    color: TAG_COLORS.includes(c as TagColor) ? (c as TagColor) : "kraft",
    size: TAG_SIZES.includes(z as TagSize) ? (z as TagSize) : "m",
    ...(node.data["tagWidth"] != null && Number.isFinite(w) ? { width: clampTagWidth(w) } : {}),
    at: ok ? { x: at.x!, y: at.y! } : TAG_HOME,
  };
}

// The canvas font is monospaced, so a glyph is 0.6em wide.
const HEAD_PX = 17,
  BODY_PX = 13.5;
const HEAD_LH = 22,
  BODY_LH = 19;
const PAD = 20; // side padding inside the card
const TOP = -18; // the card's top edge, above the eyelet
const MAX_HEAD = 3,
  MAX_BODY = 18;

/** Word-wraps one paragraph to `n` characters a line; long words are hyphenated. */
export function wrap(text: string, n: number, indent = ""): string[] {
  const out: string[] = [];
  let line = "";
  const limit = () => (out.length ? n - indent.length : n);
  for (let word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length <= limit()) {
      line += ` ${word}`;
      continue;
    }
    if (line) out.push(line);
    while (word.length > limit()) {
      out.push(`${word.slice(0, limit() - 1)}-`);
      word = word.slice(limit() - 1);
    }
    line = word;
  }
  if (line) out.push(line);
  return out.map((l, i) => (i ? indent + l : l));
}

const cap = (lines: string[], max: number) =>
  lines.length <= max
    ? lines
    : [...lines.slice(0, max - 1), `${lines[max - 1]!.replace(/.?$/, "")}…`];

export interface TagShape {
  /** The card's bottom edge (the eyelet is at y = 0). */
  bottom: number;
  width: number;
  height: number;
  /** Gentle tilt in degrees around the eyelet: the card swings away from its pin. */
  tilt: number;
  /** Card outline (eyelet at the origin, cut out as a hole). */
  body: string;
  ring: string;
  stitch: string;
  /** The string's loop through the eyelet and over the top edge. */
  loop: string;
  /** Perforation under the headline (empty when there's no note). */
  rule: string;
  text: { x: number; y: number; head: boolean; s: string }[];
  /** The sagging string from the pin to the eyelet, in block coords. */
  string: string;
}

const hole = (r: number) =>
  `M ${-r} 0 a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;

export function tagShape(
  tag: Pick<TagInfo, "head" | "body" | "size" | "at" | "width">,
  pin = TAG_PIN,
) {
  // A headline on its own gets a card that fits it; a note (or a hand-set width) uses the
  // full width.
  const full = tag.width ?? TAG_WIDTH[tag.size];
  const w =
    tag.width !== undefined || tag.body.some((l) => l.trim())
      ? full
      : Math.max(120, Math.min(full, Math.ceil(tag.head.length * HEAD_PX * 0.6) + 2 * PAD + 2));
  const left = -w / 2 + PAD;
  const headN = Math.floor((w - 2 * PAD) / (HEAD_PX * 0.6));
  const bodyN = Math.floor((w - 2 * PAD) / (BODY_PX * 0.6));
  const head = cap(wrap(tag.head, headN), MAX_HEAD);
  const body = cap(
    tag.body.flatMap((p) => {
      if (!p.trim()) return [""];
      const bullet = /^\s*[-*•]\s+/.exec(p);
      return bullet ? wrap(`• ${p.slice(bullet[0].length)}`, bodyN, "  ") : wrap(p, bodyN);
    }),
    MAX_BODY,
  );
  const text: TagShape["text"] = [];
  let y = 22 + HEAD_PX;
  head.forEach((s, k) => text.push({ x: left, y: y + k * HEAD_LH, head: true, s }));
  y += (head.length - 1) * HEAD_LH;
  let rule = "";
  if (body.length) {
    y += 15;
    rule = `M ${left} ${y} H ${w / 2 - PAD}`;
    y += 9 + BODY_PX;
    body.forEach((s, k) => s && text.push({ x: left, y: y + k * BODY_LH, head: false, s }));
    y += (body.length - 1) * BODY_LH;
  }
  const bottom = y + 20;
  const h = bottom - TOP;
  const c = 26, // chamfered top corners
    r = 10;
  const L = -w / 2,
    R = w / 2;
  const outline = (i: number) =>
    `M ${L + i} ${TOP + c} L ${L + c} ${TOP + i} H ${R - c} L ${R - i} ${TOP + c} ` +
    `V ${bottom - r - i} Q ${R - i} ${bottom - i} ${R - r - i} ${bottom - i} ` +
    `H ${L + r + i} Q ${L + i} ${bottom - i} ${L + i} ${bottom - r - i} Z`;
  const shape: TagShape = {
    bottom,
    width: w,
    height: h,
    tilt: Math.max(-5, Math.min(5, (pin.x - tag.at.x) * 0.025)),
    body: `${outline(0)} ${hole(5)}`,
    ring: `${hole(10)} ${hole(5)}`,
    stitch: outline(6.5),
    loop: "M 0 0 C -7 -9 -10 -30 0 -30 C 10 -30 7 -9 0 0",
    rule,
    text,
    string: "",
  };
  const dist = Math.hypot(tag.at.x - pin.x, tag.at.y - pin.y);
  const sag = Math.min(40, dist * 0.25);
  const mid = { x: (pin.x + tag.at.x) / 2, y: Math.max(pin.y, tag.at.y) + sag };
  shape.string = `M ${pin.x} ${pin.y} Q ${mid.x} ${mid.y} ${tag.at.x} ${tag.at.y}`;
  return shape;
}
