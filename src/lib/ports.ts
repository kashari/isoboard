import type { Node, NodeType } from "@/types/diagram";
import { project, type Point } from "./isometric";

/**
 * Where a connector meets a block. A connector runs on the ground, under the blocks, so it
 * visibly ends where it disappears behind the block's outline (`silhouette`): on the bottom
 * edge of a front face, or the top edge of the block when it arrives from behind.
 *
 * A port pins one end of a connector to a spot on the block: the `side` it leaves (or enters)
 * through (`x+` faces down-right, `y+` down-left, `x-` and `y-` are the back faces) and `at`,
 * how far along that side, from -1 to 1 (0 is the middle). Stored as `edge.data.fromPort` /
 * `edge.data.toPort`; without one, the end is wherever the route meets the block.
 */
export type Side = "x+" | "x-" | "y+" | "y-";
export interface Port {
  side: Side;
  at: number;
}
export const SIDES: Side[] = ["x+", "y+", "x-", "y-"];
/** Grid direction pointing out of a side. */
export const normalOf = (s: Side) =>
  s === "x+"
    ? { gx: 1, gy: 0 }
    : s === "x-"
      ? { gx: -1, gy: 0 }
      : s === "y+"
        ? { gx: 0, gy: 1 }
        : { gx: 0, gy: -1 };
/** The side a direction of travel leaves through. */
export const sideOf = (axis: "x" | "y", sign: number): Side =>
  `${axis}${sign < 0 ? "-" : "+"}` as Side;
/** How far `at` may go: the ends of a side are the block's corners. */
export const AT_MAX = 0.8;

export function readPort(v: unknown): Port | null {
  const p = v as Partial<Port> | undefined;
  if (!p || !SIDES.includes(p.side as Side) || !Number.isFinite(p.at)) return null;
  return { side: p.side as Side, at: Math.max(-AT_MAX, Math.min(AT_MAX, Number(p.at))) };
}

/**
 * A block's body, roughly: half its footprint `r` (grid cells), the screen y of its base and top
 * face centres (relative to the block's origin), and whether it is round.
 */
export interface Shape {
  r: number;
  base: number;
  top: number;
  round?: boolean;
}
const SLAB: Shape = { r: 0.72, base: -3, top: -12 };
const TALL: Shape = { r: 0.72, base: 15, top: -12 };
const TOWER: Shape = { r: 0.72, base: 0, top: -42 };
const DRUM: Shape = { r: 0.95, base: 0, top: -42, round: true };
const DISC: Shape = { r: 0.84, base: 4, top: -8, round: true };
const PERSON: Shape = { r: 0.8, base: 6, top: 3, round: true };
const PUCK: Shape = { r: 0.6, base: 2, top: -8, round: true };
const ROUND_SMALL: Shape = { r: 0.5, base: 0, top: -12, round: true };
const OTHER: Shape = { r: 0.68, base: 0, top: -16 };
const SHAPES: Partial<Record<NodeType, Shape>> = {
  box: TALL,
  storage: TALL,
  function: TALL,
  ai: TALL,
  client: SLAB,
  external: SLAB,
  note: SLAB,
  process: { r: 0.72, base: -4, top: -12 },
  input: { r: 0.72, base: -4, top: -12 },
  output: { r: 0.72, base: -4, top: -12 },
  timer: { r: 0.72, base: -4, top: -12 },
  event: { r: 0.72, base: -4, top: -12 },
  state: { r: 0.72, base: 7, top: -12 },
  service: TOWER,
  springboot: TOWER,
  kubernetes: TOWER,
  balancer: { r: 0.72, base: 0, top: -22 },
  nginx: { r: 0.72, base: 0, top: -22 },
  database: DRUM,
  postgres: DRUM,
  oracle: DRUM,
  mysql: DRUM,
  mongodb: DRUM,
  elastic: DRUM,
  cache: { ...DRUM, top: -23 },
  redis: { ...DRUM, top: -23 },
  queue: { r: 0.66, base: 6, top: -29 },
  kafka: { r: 0.66, base: 6, top: -29 },
  rabbitmq: { r: 0.66, base: 6, top: -29 },
  start: DISC,
  end: DISC,
  initial: DISC,
  final: DISC,
  ko: DISC,
  error: DISC,
  exception: DISC,
  condition: { r: 0.62, base: 2, top: -46 },
  user: PERSON,
  kid: PERSON,
  boy: PERSON,
  girl: PERSON,
  man: PERSON,
  woman: PERSON,
  elder: PERSON,
  developer: PERSON,
  group: { ...PERSON, r: 1 },
  entry: PUCK,
  exit: PUCK,
  history: { ...PUCK, r: 0.7 },
  junction: ROUND_SMALL,
  terminate: { r: 0.5, base: 0, top: -7 },
  choice: { r: 0.47, base: 0, top: -22 },
};
export const shapeOf = (n: Pick<Node, "type">): Shape | null =>
  n.type === "zone" ? null : (SHAPES[n.type] ?? OTHER);

/** Ground point of the block's footprint outline at a port, in grid units. */
export function portCell(n: Pick<Node, "gx" | "gy" | "type">, port: Port) {
  const r = shapeOf(n)?.r ?? 0.5;
  const nrm = normalOf(port.side);
  const across = port.at * r;
  const along = shapeOf(n)?.round ? Math.sqrt(Math.max(0, r * r - across * across)) : r;
  return {
    gx: n.gx + nrm.gx * along + (nrm.gx ? 0 : across),
    gy: n.gy + nrm.gy * along + (nrm.gy ? 0 : across),
  };
}

function hull(pts: Point[]): Point[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [],
    upper: Point[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, q) <= 0) lower.pop();
    lower.push(q);
  }
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** The block's outline on screen (a convex polygon), or null for zones. */
export function silhouette(n: Pick<Node, "gx" | "gy" | "type">): Point[] | null {
  const s = shapeOf(n);
  if (!s) return null;
  const o = project(n.gx, n.gy);
  const ring: Point[] = [];
  if (s.round)
    for (let k = 0; k < 24; k++) {
      const t = (k / 24) * Math.PI * 2;
      const p = project(Math.cos(t) * s.r, Math.sin(t) * s.r);
      ring.push(p);
    }
  else
    for (const [dx, dy] of [
      [1, 1],
      [1, -1],
      [-1, -1],
      [-1, 1],
    ] as const)
      ring.push(project(dx * s.r, dy * s.r));
  return hull(
    [s.base, s.top].flatMap((y) => ring.map((p) => ({ x: o.x + p.x, y: o.y + p.y + y }))),
  );
}

export function inside(poly: Point[], p: Point) {
  let ok = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!,
      b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) ok = !ok;
  }
  return ok;
}

/** Where segment p→q (p inside the convex polygon, q outside) crosses its outline. */
function exitPoint(poly: Point[], p: Point, q: Point): Point {
  let lo = 0,
    hi = 1;
  for (let k = 0; k < 30; k++) {
    const m = (lo + hi) / 2;
    if (inside(poly, { x: p.x + (q.x - p.x) * m, y: p.y + (q.y - p.y) * m })) lo = m;
    else hi = m;
  }
  return { x: p.x + (q.x - p.x) * hi, y: p.y + (q.y - p.y) * hi };
}

/** Cuts the start of a polyline off where it leaves `poly` (unchanged if it starts outside). */
export function clipStart(pts: Point[], poly: Point[] | null): Point[] {
  if (!poly || !inside(poly, pts[0]!)) return pts;
  for (let i = 0; i < pts.length - 1; i++)
    if (!inside(poly, pts[i + 1]!))
      return [exitPoint(poly, pts[i]!, pts[i + 1]!), ...pts.slice(i + 1)];
  return [];
}
export const clipEnd = (pts: Point[], poly: Point[] | null) =>
  clipStart([...pts].reverse(), poly).reverse();

/** Screen point where a connector leaving through `port` shows at the block's outline. */
export function portSpot(n: Pick<Node, "gx" | "gy" | "type">, port: Port): Point {
  const r = shapeOf(n)?.r ?? 0.5;
  const nrm = normalOf(port.side);
  const across = port.at * r;
  const from = { gx: n.gx + (nrm.gx ? 0 : across), gy: n.gy + (nrm.gy ? 0 : across) };
  const to = { gx: from.gx + nrm.gx * 3, gy: from.gy + nrm.gy * 3 };
  const line = clipStart([project(from.gx, from.gy), project(to.gx, to.gy)], silhouette(n));
  return line[0] ?? project(portCell(n, port).gx, portCell(n, port).gy);
}

/** The port nearest to a screen point (e.g. the pointer dragging a connector's end). */
export function nearestPort(n: Pick<Node, "gx" | "gy" | "type">, p: Point): Port {
  let best: Port = { side: "x+", at: 0 },
    dist = Infinity;
  for (const side of SIDES)
    for (let k = -16; k <= 16; k++) {
      const port = { side, at: k / 20 };
      const q = portSpot(n, port);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < dist) [best, dist] = [port, d];
    }
  return best;
}
