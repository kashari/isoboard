import type { Edge, Node, NodeType } from "@/types/diagram";
import {
  project,
  blockBoxes,
  labelSpot,
  trimRoute,
  readBend,
  type Box,
  type Point,
} from "./isometric";
import { edgeText } from "./logic";

/**
 * Connector routing. A route runs along the iso axes from block `a` to block `b`:
 * it starts along `start`, turns at each value in `stops` (alternating axes), then finishes
 * with two moves that land on `b`. `{ start: "x", stops: [] }` is the classic L shape and
 * `{ start: "x", stops: [x1] }` a Z through column x1. Stored in `edge.data.route`.
 *
 * Every segment is draggable sideways: segment j (0-based, raw) sits on the line given by
 * `stops[j - 1]`; the first and last segments are anchored to blocks, so grabbing one first
 * inserts a stop (`grabSegment`).
 *
 * Connectors sharing a grid line get their own parallel lane (`LANE` grid units apart), so
 * no two connectors are ever drawn on top of each other.
 */
export type Axis = "x" | "y";
export interface Route {
  start: Axis;
  stops: number[];
}
export type Cell = { gx: number; gy: number };

const flip = (a: Axis): Axis => (a === "x" ? "y" : "x");
/** Axis of raw segment `j`. */
export const segAxis = (r: Route, j: number): Axis => (j % 2 ? flip(r.start) : r.start);
const coord = (p: Cell, axis: Axis) => (axis === "x" ? p.gx : p.gy);
const moveTo = (p: Cell, axis: Axis, v: number): Cell =>
  axis === "x" ? { gx: v, gy: p.gy } : { gx: p.gx, gy: v };
const same = (p: Cell, q: Cell) => p.gx === q.gx && p.gy === q.gy;

/** The user's stored route, if any (older diagrams stored a single elbow as `data.bend`). */
export function readRoute(data: Record<string, unknown>): Route | null {
  const r = data["route"] as Partial<Route> | undefined;
  if (
    r &&
    (r.start === "x" || r.start === "y") &&
    Array.isArray(r.stops) &&
    r.stops.every((v) => Number.isFinite(v))
  )
    return { start: r.start, stops: [...r.stops] };
  const bend = readBend(data);
  return bend ? { start: "x", stops: [bend.gx, bend.gy] } : null;
}

/** Raw corner list, `stops.length + 3` points; zero-length moves are kept. */
export function routeCorners(a: Cell, b: Cell, r: Route): Cell[] {
  const pts: Cell[] = [{ gx: a.gx, gy: a.gy }];
  let axis = r.start;
  let cur = pts[0]!;
  for (const s of r.stops) {
    cur = moveTo(cur, axis, s);
    pts.push(cur);
    axis = flip(axis);
  }
  pts.push(moveTo(cur, axis, coord(b, axis)));
  pts.push({ gx: b.gx, gy: b.gy });
  return pts;
}

export interface Segment {
  axis: Axis;
  p: Cell;
  q: Cell;
  /** Raw segment indices merged into this one (for dragging). */
  js: number[];
}
/** Visible segments: zero-length moves dropped, collinear neighbours merged. */
export function routeSegments(a: Cell, b: Cell, r: Route): Segment[] {
  const corners = routeCorners(a, b, r);
  const segs: Segment[] = [];
  for (let j = 0; j < corners.length - 1; j++) {
    const p = corners[j]!,
      q = corners[j + 1]!;
    if (same(p, q)) continue;
    const axis = segAxis(r, j);
    const last = segs.at(-1);
    if (last && last.axis === axis) {
      last.q = q;
      last.js.push(j);
    } else segs.push({ axis, p, q, js: [j] });
  }
  return segs;
}

/** Same route, with redundant stops removed. */
export function normalizeRoute(a: Cell, b: Cell, r: Route): Route {
  const segs = routeSegments(a, b, r);
  if (segs.length <= 2) return { start: segs[0]?.axis ?? "x", stops: [] };
  return {
    start: segs[0]!.axis,
    stops: segs.slice(0, -2).map((s) => coord(s.q, s.axis)),
  };
}

type Block = Pick<Node, "id" | "gx" | "gy" | "type">;
/** How many blocks (other than its ends) a route runs through. */
function crossings(segs: Segment[], blocks: Block[], skip: string[]) {
  let n = 0;
  for (const block of blocks) {
    if (block.type === "zone" || skip.includes(block.id)) continue;
    for (const s of segs) {
      const lo = Math.min(coord(s.p, s.axis), coord(s.q, s.axis)) - 0.6;
      const hi = Math.max(coord(s.p, s.axis), coord(s.q, s.axis)) + 0.6;
      const along = coord(block, s.axis),
        perp = coord(block, flip(s.axis));
      if (along > lo && along < hi && Math.abs(perp - coord(s.p, flip(s.axis))) < 0.75) {
        n++;
        break;
      }
    }
  }
  return n;
}
/** Screen direction (dy) of a route's last segment: > 0 means it arrives from behind the block. */
function arrivesFromBehind(segs: Segment[]) {
  const s = segs.at(-1);
  if (!s) return false;
  return project(s.q.gx, s.q.gy).y - project(s.p.gx, s.p.gy).y > 0;
}
/**
 * The default L route: of the two L shapes, the one that runs through fewer blocks and,
 * on a tie, arrives at the target from the front so the arrowhead is never hidden.
 */
export function autoRoute(a: Block, b: Block, blocks: Block[] = []): Route {
  if (a.gy === b.gy) return { start: "x", stops: [] };
  if (a.gx === b.gx) return { start: "y", stops: [] };
  const score = (start: Axis) => {
    const segs = routeSegments(a, b, { start, stops: [] });
    return crossings(segs, blocks, [a.id, b.id]) * 10 + (arrivesFromBehind(segs) ? 3 : 0);
  };
  return score("x") <= score("y") ? { start: "x", stops: [] } : { start: "y", stops: [] };
}

/** Prepares raw segment `j` for dragging; anchored end segments get a stop of their own. */
export function grabSegment(a: Cell, b: Cell, r: Route, j: number): { route: Route; j: number } {
  const m = r.stops.length;
  if (j <= 0)
    return { route: { start: flip(r.start), stops: [coord(a, flip(r.start)), ...r.stops] }, j: 1 };
  if (j >= m + 1)
    return { route: { ...r, stops: [...r.stops, coord(b, segAxis(r, m))] }, j: m + 1 };
  return { route: { ...r, stops: [...r.stops] }, j };
}
/** Axis along which raw segment `j` (1 ≤ j ≤ stops.length) slides. */
export const slideAxis = (r: Route, j: number): Axis => segAxis(r, j - 1);
export function setSegment(r: Route, j: number, v: number): Route {
  const stops = [...r.stops];
  stops[j - 1] = v;
  return { ...r, stops };
}

/** Moves a stored route (or legacy elbow) along with its blocks. */
export function shiftRoute(data: Record<string, unknown>, dx: number, dy: number) {
  const r = data["route"] ? readRoute(data) : null;
  if (r)
    return {
      ...data,
      route: { ...r, stops: r.stops.map((v, i) => v + (segAxis(r, i) === "x" ? dx : dy)) },
    };
  const bend = readBend(data);
  return bend ? { ...data, bend: { gx: bend.gx + dx, gy: bend.gy + dy } } : data;
}

/** Grid units between parallel connectors sharing a line (~8px on screen). */
export const LANE = 0.26;
/**
 * Lane offset for every segment of every route. Segments on the same grid line whose spans
 * overlap form a cluster; each gets its own lane, centred on the line.
 */
export function laneOffsets(routes: Segment[][]): number[][] {
  const out = routes.map((segs) => segs.map(() => 0));
  const groups = new Map<string, { r: number; s: number; lo: number; hi: number }[]>();
  routes.forEach((segs, r) =>
    segs.forEach((seg, s) => {
      const key = `${seg.axis}:${coord(seg.p, flip(seg.axis))}`;
      const a = coord(seg.p, seg.axis),
        b = coord(seg.q, seg.axis);
      const list = groups.get(key) ?? [];
      list.push({ r, s, lo: Math.min(a, b), hi: Math.max(a, b) });
      groups.set(key, list);
    }),
  );
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((p, q) => p.lo - q.lo || q.hi - p.hi || p.r - q.r);
    let cluster: typeof list = [];
    let reach = -Infinity;
    const flush = () => {
      const ends: number[] = [];
      const lanes = cluster.map((it) => {
        let l = ends.findIndex((end) => end <= it.lo + 1e-9);
        if (l < 0) l = ends.push(it.hi) - 1;
        else ends[l] = it.hi;
        return l;
      });
      cluster.forEach((it, i) => {
        out[it.r]![it.s] = (lanes[i]! - (ends.length - 1) / 2) * LANE;
      });
    };
    for (const it of list) {
      if (it.lo >= reach - 1e-9 && cluster.length) {
        flush();
        cluster = [];
      }
      cluster.push(it);
      reach = Math.max(reach, it.hi);
    }
    flush();
  }
  return out;
}

/** Corner points of a route with each segment shifted onto its lane. */
export function offsetPoints(segs: Segment[], offsets: number[]): Cell[] {
  const shift = (p: Cell, seg: Segment, o: number): Cell =>
    seg.axis === "x" ? { gx: p.gx, gy: p.gy + o } : { gx: p.gx + o, gy: p.gy };
  const pts: Cell[] = [shift(segs[0]!.p, segs[0]!, offsets[0] ?? 0)];
  segs.forEach((seg, i) => {
    const next = segs[i + 1];
    const q = shift(seg.q, seg, offsets[i] ?? 0);
    pts.push(next ? shift(q, next, offsets[i + 1] ?? 0) : q);
  });
  return pts;
}

/** Polyline with rounded corners (radius `r`, shrunk on short segments). */
export function roundedPath(pts: Point[], r = 12): string {
  if (pts.length < 3) return "M " + pts.map((p) => `${p.x} ${p.y}`).join(" L ");
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1]!,
      c = pts[i]!,
      n = pts[i + 1]!;
    const l1 = Math.hypot(c.x - p.x, c.y - p.y),
      l2 = Math.hypot(n.x - c.x, n.y - c.y);
    const k = Math.min(r, l1 / 2, l2 / 2);
    const b = { x: c.x - ((c.x - p.x) / (l1 || 1)) * k, y: c.y - ((c.y - p.y) / (l1 || 1)) * k };
    const e = { x: c.x + ((n.x - c.x) / (l2 || 1)) * k, y: c.y + ((n.y - c.y) / (l2 || 1)) * k };
    d += ` L ${b.x} ${b.y} Q ${c.x} ${c.y} ${e.x} ${e.y}`;
  }
  const last = pts.at(-1)!;
  return d + ` L ${last.x} ${last.y}`;
}

// How far (px along the route) a connector reaches into a block before it shows. Arriving
// from behind, the block's body hides more of the line, so the route stops further out.
const SMALL_TYPES = new Set<NodeType>([
  "initial",
  "final",
  "junction",
  "entry",
  "exit",
  "history",
  "terminate",
]);
function reach(n: Node, behind: boolean) {
  if (n.type === "zone") return 0;
  if (SMALL_TYPES.has(n.type)) return behind ? 30 : 22;
  return behind ? 66 : 42;
}

// Tag pills use JetBrains Mono (every glyph 0.6em wide), so text width is exact.
export const LABEL_SIZE = 10;
export const labelWidth = (text: string) => text.length * LABEL_SIZE * 0.6;
/** Extra tag width for an item icon in front of the text. */
export const ICON_W = 16;
/** Arrowhead length (px); the line stops at its base. */
export const HEAD = 13;

export interface Arrow {
  x: number;
  y: number;
  /** Direction of travel, degrees. */
  angle: number;
}
export interface EdgeLayout {
  edge: Edge;
  index: number;
  route: Route;
  custom: boolean;
  /** Screen polyline of the visible line (ends at the arrowhead bases). */
  points: Point[];
  path: string;
  head: Arrow;
  tail: Arrow | null;
  /** One per visible segment: raw index `j`, its ends `p`/`q` and the grip at its midpoint. */
  grips: { j: number; axis: Axis; x: number; y: number; p: Point; q: Point }[];
  tag: {
    x: number;
    y: number;
    text: string;
    guard: string;
    badge: string;
    badgeW: number;
    textW: number;
    /** Sticker icon of an item (`edge.data.icon`), shown in the tag before the text. */
    icon: string;
  };
}

const arrowAt = (tip: Point, from: Point): Arrow => ({
  x: tip.x,
  y: tip.y,
  angle: (Math.atan2(tip.y - from.y, tip.x - from.x) * 180) / Math.PI,
});

/**
 * Lays out every connector: route, lanes, trimming at block edges, arrowheads, drag grips and
 * tag placement (each tag avoids blocks, corners and the tags placed before it).
 */
export function layoutEdges(
  nodes: Node[],
  edges: Edge[],
  opts: { steps?: boolean; override?: { id: string; route: Route } | null } = {},
): EdgeLayout[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const items = edges.flatMap((edge, index) => {
    const a = byId.get(edge.from),
      b = byId.get(edge.to);
    if (!a || !b || (a.gx === b.gx && a.gy === b.gy)) return [];
    const stored = readRoute(edge.data);
    const route =
      opts.override?.id === edge.id ? opts.override.route : (stored ?? autoRoute(a, b, nodes));
    const segs = routeSegments(a, b, route);
    return segs.length ? [{ edge, index, a, b, route, custom: !!stored, segs }] : [];
  });
  const offsets = laneOffsets(items.map((it) => it.segs));
  const obstacles: Box[] = nodes.filter((n) => n.type !== "zone").flatMap(blockBoxes);
  const shaped = items.map((it, i) => {
    const grid = offsetPoints(it.segs, offsets[i]!);
    const screen = grid.map((g) => project(g.gx, g.gy));
    for (const c of screen.slice(1, -1))
      obstacles.push({ x0: c.x - 12, y0: c.y - 8, x1: c.x + 12, y1: c.y + 8 });
    return { ...it, grid, screen };
  });
  return shaped.map((it) => {
    const { edge, a, b, screen } = it;
    const bidirectional = edge.style === "bidirectional";
    const first = screen[1]!.y - screen[0]!.y < 0,
      last = screen.at(-1)!.y - screen.at(-2)!.y > 0;
    const tips = trimRoute(screen, reach(a, first), reach(b, last));
    const tip = tips.at(-1)!,
      start = tips[0]!;
    const head = arrowAt(tip, tips.at(-2)!);
    const tail = bidirectional ? arrowAt(start, tips[1]!) : null;
    // The line stops under the arrowheads' bases so its round cap never pokes through.
    const points = trimRoute(tips, bidirectional ? HEAD - 2 : 0, HEAD - 2);
    const grips = it.segs.map((seg, s) => {
      const p = screen[s]!,
        q = screen[s + 1]!;
      // Prefer an inner (free) raw segment; end segments get a stop when grabbed.
      const m = it.route.stops.length;
      const j = seg.js.find((k) => k >= 1 && k <= m) ?? seg.js[0]!;
      return { j, axis: seg.axis, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, p, q };
    });
    // State-machine transitions carry no text label; a guarded one shows a diamond.
    const text = edge.kind === "transition" ? "" : edgeText(edge).trim();
    const guard = edge.kind === "transition" ? String(edge.data["guard"] ?? "").trim() : "";
    const badge = opts.steps ? String(it.index + 1) : "";
    const badgeW = badge ? Math.max(20, labelWidth(badge) + 11) : 0;
    const icon = String(edge.data["icon"] ?? "").trim();
    const textW = text ? labelWidth(text) + 20 + (icon ? ICON_W : 0) : icon ? 22 : 0;
    const tagW = badgeW + textW + (guard ? (badgeW + textW ? 22 : 16) : 0);
    const spot = labelSpot(tips, tagW, obstacles);
    if (tagW)
      obstacles.push({
        x0: spot.x - tagW / 2,
        y0: spot.y - 11,
        x1: spot.x + tagW / 2,
        y1: spot.y + 13,
      });
    return {
      edge,
      index: it.index,
      route: it.route,
      custom: it.custom,
      points,
      path: roundedPath(points),
      head,
      tail,
      grips,
      tag: { x: spot.x, y: spot.y, text, guard, badge, badgeW, textW, icon },
    };
  });
}

/** Connectors a presentation steps through, in order: both ends must exist. */
export function presentableEdges(nodes: Node[], edges: Edge[]) {
  const ids = new Set(nodes.map((n) => n.id));
  return edges.filter((e) => e.from !== e.to && ids.has(e.from) && ids.has(e.to));
}

/** Distance from `p` to segment `a`–`b`. */
export function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

/** Screen bounds of some blocks (with room for their names) and zones, for framing the camera. */
export function frameOf(nodes: Node[], extra: Point[] = []) {
  const blocks = nodes.filter((n) => n.type !== "zone").map((n) => project(n.gx, n.gy, n.gz));
  const pts = [...blocks, ...extra];
  const box = pts.length
    ? {
        x0: Math.min(...pts.map((p) => p.x)) - 100,
        x1: Math.max(...pts.map((p) => p.x)) + 100,
        y0: Math.min(...pts.map((p) => p.y)) - 120,
        y1: Math.max(...pts.map((p) => p.y)) + 90,
      }
    : { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  // Zones are drawn from their top corner, `width` cells along gx and `height` along gy.
  for (const z of nodes.filter((n) => n.type === "zone")) {
    const w = Number(z.data["width"] ?? 6),
      h = Number(z.data["height"] ?? 4);
    for (const [dx, dy] of [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ] as const) {
      const p = project(z.gx + dx, z.gy + dy);
      box.x0 = Math.min(box.x0, p.x - 20);
      box.x1 = Math.max(box.x1, p.x + 20);
      box.y0 = Math.min(box.y0, p.y - 52);
      box.y1 = Math.max(box.y1, p.y - 12);
    }
  }
  return Number.isFinite(box.x0) ? box : { x0: -350, y0: -200, x1: 350, y1: 200 };
}
