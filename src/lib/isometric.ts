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
export function edgePoints(
  a: Node,
  b: Node,
): [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }] {
  return [project(a.gx, a.gy), project(b.gx, a.gy), project(b.gx, b.gy)];
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
