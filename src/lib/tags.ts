import type { Node } from "@/types/diagram";

/**
 * Price tags: a short note hung on a block by a string. Stored in the node's data:
 * `tag` (text; the first line is the headline, up to two more lines of small print),
 * `tagColor` (one of TAG_COLORS) and `tagAt` (where the tag's eyelet hangs, in canvas
 * pixels relative to the block's origin).
 */
export const TAG_COLORS = ["kraft", "paper", "yellow", "pink", "mint", "sky"] as const;
export type TagColor = (typeof TAG_COLORS)[number];
/** Where the string is pinned on the block, and where the tag hangs by default. */
export const TAG_PIN = { x: 34, y: -24 };
export const TAG_HOME = { x: 74, y: 2 };
const MAX_LINES = 3;
const MAX_CHARS = 30;

export interface Point {
  x: number;
  y: number;
}
export interface TagInfo {
  lines: string[];
  color: TagColor;
  at: Point;
}

const clip = (s: string) => (s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS - 1).trimEnd()}…` : s);

export function readTag(node: Node): TagInfo | null {
  const raw = node.data["tag"];
  if (typeof raw !== "string" || !raw.trim()) return null;
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, MAX_LINES)
    .map(clip);
  const c = node.data["tagColor"];
  const color = TAG_COLORS.includes(c as TagColor) ? (c as TagColor) : "kraft";
  const at = node.data["tagAt"] as Partial<Point> | undefined;
  const ok = at && Number.isFinite(at.x) && Number.isFinite(at.y);
  return { lines, color, at: ok ? { x: at.x!, y: at.y! } : TAG_HOME };
}

// Rough glyph widths for the canvas font (bold headline, regular small print).
const HEAD_W = 7.7,
  SMALL_W = 6.1;
const HEAD = 13,
  SMALL = 12;
const TIP = 14; // from the eyelet to the tag's pointed end
const TEXT_X = 11; // from the eyelet to where the text starts

export interface TagShape {
  /** +1 when the tag hangs right of its pin (point on the left), -1 when mirrored. */
  side: 1 | -1;
  /** Tilt in degrees around the eyelet. */
  tilt: number;
  /** Body outline in mirrored-local coords (apply scale(side, 1)), with the eyelet as a hole. */
  body: string;
  /** The reinforcing ring around the eyelet. */
  ring: string;
  /** Dashed stitching just inside the edge (mirrored-local). */
  stitch: string;
  /** The loop of string through the eyelet and round the point (mirrored-local). */
  loop: string;
  /** Text baselines, in unmirrored local coords. */
  text: { x: number; y: number; head: boolean; s: string }[];
  /** The sagging string from the pin to the eyelet, in block coords. */
  string: string;
  width: number;
  height: number;
}

const hole = (r: number) =>
  `M ${-r} 0 a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;

export function tagShape(lines: string[], at: Point, pin: Point = TAG_PIN): TagShape {
  const side: 1 | -1 = at.x >= pin.x ? 1 : -1;
  const textW = Math.max(24, ...lines.map((l, i) => l.length * (i === 0 ? HEAD_W : SMALL_W)));
  const w = TEXT_X + textW + 11; // eyelet → far end
  const h = 12 + HEAD + 4 + SMALL * (lines.length - 1);
  const x0 = -TIP,
    c = Math.min(11, h / 2 - 1),
    r = 5,
    t = h / 2;
  const body =
    `M ${x0} ${-(t - c)} L ${x0 + c} ${-t} H ${w - r} Q ${w} ${-t} ${w} ${-t + r} ` +
    `V ${t - r} Q ${w} ${t} ${w - r} ${t} H ${x0 + c} L ${x0} ${t - c} Z ` +
    hole(3.3);
  const ring = `${hole(6.2)} ${hole(3.3)}`;
  const i = 3.5;
  const stitch =
    `M ${x0 + i + 1} ${-(t - c)} L ${x0 + c + 1} ${-t + i} H ${w - i} V ${t - i} ` +
    `H ${x0 + c + 1} L ${x0 + i + 1} ${t - c} Z`;
  const loop = `M 0 0 C -5 -9 ${x0 - 9} -10 ${x0 - 6} -1 C ${x0 - 4} 6 -6 7 0 0`;
  // Lines are laid out left to right whichever way the tag points.
  const left = side === 1 ? TEXT_X : -w + 10;
  let y = -t + 6 + HEAD - 1.5;
  const text = lines.map((s, k) => {
    const row = { x: left, y, head: k === 0, s };
    y += k === 0 ? SMALL + 2.5 : SMALL;
    return row;
  });
  // Tags hang: the further below the pin, the more they droop away from it.
  const dx = Math.abs(at.x - pin.x),
    dy = at.y - pin.y;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const tilt = side * Math.max(-8, Math.min(14, angle * 0.22 + 3));
  const dist = Math.hypot(at.x - pin.x, at.y - pin.y);
  const sag = Math.min(26, dist * 0.22);
  const mid = { x: (pin.x + at.x) / 2, y: (pin.y + at.y) / 2 + sag };
  const string = `M ${pin.x} ${pin.y} Q ${mid.x} ${mid.y} ${at.x} ${at.y}`;
  return { side, tilt, body, ring, stitch, loop, text, string, width: w - x0, height: h };
}
