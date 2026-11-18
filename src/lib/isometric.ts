import type { Node } from "@/types/diagram";
export const TILE_W = 64;
export const TILE_H = 32;
export const TILE_Z = 32;
export function project(gx: number, gy: number, gz = 0) {
  return { x: ((gx - gy) * TILE_W) / 2, y: ((gx + gy) * TILE_H) / 2 - gz * TILE_Z };
}
export function unproject(x: number, y: number, gz = 0) {
  return {
    gx: x / TILE_W + (y + gz * TILE_Z) / TILE_H,
    gy: (y + gz * TILE_Z) / TILE_H - x / TILE_W,
  };
}
export function depthSort(nodes: Node[]) {
  return [...nodes].sort(
    (a, b) => (a.type === "zone" ? -1000 : a.gx + a.gy) - (b.type === "zone" ? -1000 : b.gx + b.gy),
  );
}
export type Point = { x: number; y: number };
export type Bend = { gx: number; gy: number };
/** A connector's user-placed elbow (`edge.data.bend`), or null for the default route. */
export function readBend(data: Record<string, unknown>): Bend | null {
  const b = data["bend"] as Partial<Bend> | undefined;
  return b && Number.isFinite(b.gx) && Number.isFinite(b.gy) ? { gx: b.gx!, gy: b.gy! } : null;
}
/** Where the elbow sits when the user hasn't moved it: first along gx, then along gy. */
export function defaultBend(a: Node, b: Node): Bend {
  return { gx: b.gx, gy: a.gy };
}
/**
 * Connector route along the iso axes, passing through `bend`:
 * a → (bend.gx, a.gy) → bend → (b.gx, bend.gy) → b. With the default bend this is the classic
 * L shape; any other bend gives a stepped route. Repeated points are dropped so the arrow marker
 * always takes its direction from a real segment.
 */
export function edgeRoute(a: Node, b: Node, bend: Bend | null = null): Point[] {
  const c = bend ?? defaultBend(a, b);
  const grid: Bend[] = [a, { gx: c.gx, gy: a.gy }, c, { gx: b.gx, gy: c.gy }, b];
  const pts: Point[] = [];
  for (const g of grid) {
    const p = project(g.gx, g.gy);
    const last = pts.at(-1);
    if (!last || last.x !== p.x || last.y !== p.y) pts.push(p);
  }
  return pts.length > 1 ? pts : [pts[0]!, pts[0]!];
}
/** Point at fraction `t` (0…1) of the way along a polyline. */
export function pointAlong(pts: Point[], t: number): Point {
  const lengths = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y));
  let left = lengths.reduce((s, l) => s + l, 0) * t;
  for (let i = 0; i < lengths.length; i++) {
    const l = lengths[i]!;
    if (left <= l) {
      const f = l ? left / l : 0;
      const p = pts[i]!,
        q = pts[i + 1]!;
      return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f };
    }
    left -= l;
  }
  return pts.at(-1)!;
}
// Halfway first, then alternately earlier/later in 5% steps.
const LABEL_SPOTS = [
  0.5,
  ...Array.from({ length: 18 }, (_, i) => 0.5 + (i % 2 ? 1 : -1) * 0.05 * Math.ceil((i + 1) / 2)),
];
export type Box = { x0: number; y0: number; x1: number; y1: number };
const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
  Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
/** Screen areas a block covers: its body, and its name and sublabel underneath (13px mono). */
export function blockBoxes(n: Node): Box[] {
  const q = project(n.gx, n.gy, n.gz);
  const nameW = Math.max(n.label.length * 7.8, n.sublabel.length * 5.7) / 2 + 6;
  return [
    { x0: q.x - 50, y0: q.y - 80, x1: q.x + 50, y1: q.y + 34 },
    { x0: q.x - nameW, y0: q.y + 34, x1: q.x + nameW, y1: q.y + (n.sublabel ? 76 : 58) },
  ];
}
/**
 * Where a connector's tag (`width` px wide, centred on the route) goes: the spot closest to
 * halfway whose box is clear of every obstacle (blocks and tags already placed), or failing that
 * the spot that overlaps them least.
 */
export function labelSpot(pts: Point[], width: number, obstacles: Box[]): Point {
  let best = pointAlong(pts, 0.5),
    bestScore = Infinity;
  for (const t of LABEL_SPOTS) {
    const p = pointAlong(pts, t);
    const box = { x0: p.x - width / 2 - 4, y0: p.y - 13, x1: p.x + width / 2 + 4, y1: p.y + 15 };
    const score = obstacles.reduce((s, o) => s + overlap(o, box), 0);
    if (score === 0) return p;
    if (score < bestScore) [best, bestScore] = [p, score];
  }
  return best;
}
/** Grid cell under the centre of the visible canvas (viewport = pan/zoom, size in px). */
export function viewCenterCell(
  viewport: { x: number; y: number; zoom: number },
  width: number,
  height: number,
) {
  const g = unproject(
    (width / 2 - viewport.x) / viewport.zoom,
    (height / 2 - viewport.y) / viewport.zoom,
  );
  return { gx: Math.round(g.gx), gy: Math.round(g.gy) };
}
/**
 * Nearest cell to (gx, gy) with no other block within `spacing - 1` cells on either axis (4 leaves
 * room for labels), so a
 * new block never lands on top of an existing one. Zones are ignored (blocks sit inside them).
 */
export function freeCell(nodes: Node[], gx: number, gy: number, spacing = 4) {
  const taken = (x: number, y: number) =>
    nodes.some(
      (n) => n.type !== "zone" && Math.abs(n.gx - x) < spacing && Math.abs(n.gy - y) < spacing,
    );
  for (let r = 0; r <= 60; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!taken(gx + dx, gy + dy)) return { gx: gx + dx, gy: gy + dy };
      }
  return { gx, gy };
}
/**
 * Cuts `start` px off the beginning and `end` px off the end of a polyline, so a connector stops
 * at the block's edge (its arrowhead stays visible) instead of at the hidden centre. Short routes
 * are trimmed proportionally so something always remains.
 */
export function trimRoute(pts: Point[], start: number, end: number): Point[] {
  const total = pts
    .slice(1)
    .reduce((s, p, i) => s + Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y), 0);
  const k = start + end > total * 0.8 ? (total * 0.8) / (start + end || 1) : 1;
  const cut = (line: Point[], len: number) => {
    let left = len;
    for (let i = 0; i < line.length - 1; i++) {
      const p = line[i]!,
        q = line[i + 1]!;
      const l = Math.hypot(q.x - p.x, q.y - p.y);
      if (left < l) {
        const t = left / l;
        return [{ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }, ...line.slice(i + 1)];
      }
      left -= l;
    }
    return line.slice(-2);
  };
  return cut(cut(pts, start * k).reverse(), end * k).reverse();
}
