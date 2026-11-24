/**
 * Connector path finding: A* over the grid, with a cost field that makes connectors behave like
 * well-mannered wires.
 *
 * - Blocks are solid (their 3×3 footprint is very expensive, never impossible, so a path always
 *   exists), their name labels are soft walls, and a thin halo keeps lines off block edges.
 * - Every corner costs extra, so routes stay simple, and lines leave and enter blocks straight
 *   (no corner hidden inside a block's footprint).
 * - Connectors routed earlier leave tracks: running along one is discouraged (each connector
 *   gets its own path) and crossing one costs a little.
 * - Arriving from behind a block (moving down the screen) costs extra, so arrowheads land on
 *   the visible front faces whenever that is cheap.
 *
 * Pure and deterministic; works in whole grid cells.
 */
export type Cell = { gx: number; gy: number };
export type Obstacle = { id: string; gx: number; gy: number };

export const COST = {
  step: 1,
  bend: 2.5,
  block: 60,
  label: 4,
  halo: 0.5,
  share: 1.5,
  /** Turning inside an end's footprint (the corner would hide in the block). */
  tightBend: 20,
  cross: 0.8,
  behind: 2,
  backExit: 1,
};

// +gx, -gx, +gy, -gy. On screen +gx and +gy run down (towards the viewer).
const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];
const DOWN = [true, false, true, false];
const MARGIN = 5;

/** Extra cost a block at offset (dx, dy) from a cell adds to it. */
function contribution(dx: number, dy: number) {
  const ax = Math.abs(dx),
    ay = Math.abs(dy);
  if (ax <= 1 && ay <= 1) return COST.block;
  // The name sits right under the block, on the +gx+gy diagonal.
  if (dx >= 1 && dy >= 1 && dx <= 2 && dy <= 2) return dx === dy ? COST.label : COST.label / 2;
  if (ax <= 2 && ay <= 2) return COST.halo;
  return 0;
}

class Heap {
  private f: number[] = [];
  private v: number[] = [];
  get size() {
    return this.v.length;
  }
  push(f: number, v: number) {
    const fs = this.f,
      vs = this.v;
    let i = vs.length;
    fs.push(f);
    vs.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (fs[p]! <= f) break;
      fs[i] = fs[p]!;
      vs[i] = vs[p]!;
      i = p;
    }
    fs[i] = f;
    vs[i] = v;
  }
  pop(): number {
    const fs = this.f,
      vs = this.v;
    const top = vs[0]!;
    const f = fs.pop()!,
      v = vs.pop()!;
    const n = vs.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && fs[c + 1]! < fs[c]!) c++;
        if (fs[c]! >= f) break;
        fs[i] = fs[c]!;
        vs[i] = vs[c]!;
        i = c;
      }
      fs[i] = f;
      vs[i] = v;
    }
    return top;
  }
}

/** The grid the connectors of one diagram are routed on. */
export class Field {
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
  readonly h: number;
  private base: Float32Array;
  /** Tracks left by routed connectors, per axis. */
  private alongX: Uint16Array;
  private alongY: Uint16Array;

  constructor(
    private blocks: Obstacle[],
    extra: Cell[] = [],
  ) {
    const xs = [...blocks, ...extra].map((b) => b.gx),
      ys = [...blocks, ...extra].map((b) => b.gy);
    this.x0 = Math.min(0, ...xs) - MARGIN;
    this.y0 = Math.min(0, ...ys) - MARGIN;
    this.w = Math.max(0, ...xs) + MARGIN - this.x0 + 1;
    this.h = Math.max(0, ...ys) + MARGIN - this.y0 + 1;
    const n = this.w * this.h;
    this.base = new Float32Array(n);
    this.alongX = new Uint16Array(n);
    this.alongY = new Uint16Array(n);
    for (const b of blocks)
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const i = this.index(b.gx + dx, b.gy + dy);
          if (i >= 0) this.base[i]! += contribution(dx, dy);
        }
  }

  index(gx: number, gy: number) {
    const x = gx - this.x0,
      y = gy - this.y0;
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : y * this.w + x;
  }

  /** Leaves a connector's track on the field (a corner list of axis-aligned moves). */
  occupy(corners: Cell[]) {
    for (let k = 0; k < corners.length - 1; k++) {
      const p = corners[k]!,
        q = corners[k + 1]!;
      const along = p.gy === q.gy ? this.alongX : this.alongY;
      const sx = Math.sign(q.gx - p.gx),
        sy = Math.sign(q.gy - p.gy);
      let x = p.gx,
        y = p.gy;
      for (;;) {
        const i = this.index(x, y);
        if (i >= 0) along[i] = Math.min(65535, along[i]! + 1);
        if (x === q.gx && y === q.gy) break;
        x += sx;
        y += sy;
      }
    }
  }

  /**
   * Cheapest path from block `a` to block `b`, as the list of cells it visits (both ends
   * included), or null when either end is off the field. `ends` pins the first move out of `a`
   * and the last move into `b` to a direction (0…3: +gx, -gx, +gy, -gy) when a connector's end
   * is fixed to one side of its block.
   */
  route(a: Obstacle, b: Obstacle, ends: { out?: number; in?: number } = {}): Cell[] | null {
    const { w, h } = this;
    const start = this.index(a.gx, a.gy),
      goal = this.index(b.gx, b.gy);
    if (start < 0 || goal < 0 || start === goal) return null;
    const n = w * h;
    // The two ends' own footprints (and labels) don't count against this connector.
    const own = (x: number, y: number, e: Obstacle) =>
      Math.abs(x - e.gx) <= 2 && Math.abs(y - e.gy) <= 2 ? contribution(x - e.gx, y - e.gy) : 0;
    const near = (x: number, y: number, e: Obstacle) =>
      Math.abs(x - e.gx) <= 1 && Math.abs(y - e.gy) <= 1;
    const g = new Float32Array(n * 4).fill(Infinity);
    const prev = new Int32Array(n * 4).fill(-1);
    const closed = new Uint8Array(n * 4);
    const heap = new Heap();
    const bx = b.gx - this.x0,
      by = b.gy - this.y0;
    const heuristic = (x: number, y: number) => Math.abs(x - bx) + Math.abs(y - by);
    const ax = a.gx - this.x0,
      ay = a.gy - this.y0;
    // Seed: the first move out of `a`, in each direction.
    for (let d = 0; d < 4; d++) {
      if (ends.out !== undefined && d !== ends.out) continue;
      const x = ax + DX[d]!,
        y = ay + DY[d]!;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const c = y * w + x;
      const cost = this.stepCost(c, d, x, y, a, b, own, near) + (DOWN[d] ? 0 : COST.backExit);
      // A tiny bias makes ties go along gx first (the classic default L).
      const s = c * 4 + d;
      g[s] = cost + (d >= 2 ? 0.001 : 0);
      prev[s] = -2 - start;
      heap.push(g[s]! + heuristic(x, y), s);
    }
    let end = -1;
    while (heap.size) {
      const s = heap.pop();
      if (closed[s]) continue;
      closed[s] = 1;
      const c = s >> 2,
        d = s & 3;
      if (c === goal && (ends.in === undefined || d === ends.in)) {
        end = s;
        break;
      }
      const x = c % w,
        y = (c - x) / w;
      for (let nd = 0; nd < 4; nd++) {
        if ((nd ^ 1) === d) continue; // no U-turns
        const nx = x + DX[nd]!,
          ny = y + DY[nd]!;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nc = ny * w + nx,
          ns = nc * 4 + nd;
        if (closed[ns]) continue;
        let cost = g[s]! + this.stepCost(nc, nd, nx, ny, a, b, own, near);
        if (c === goal) continue; // arrived the wrong way: never pass through the block
        if (nd !== d) {
          const gx = x + this.x0,
            gy = y + this.y0;
          cost += near(gx, gy, a) || near(gx, gy, b) ? COST.tightBend : COST.bend;
        }
        if (nc === goal && DOWN[nd]) cost += COST.behind;
        if (cost < g[ns]!) {
          g[ns] = cost;
          prev[ns] = s;
          heap.push(cost + heuristic(nx, ny), ns);
        }
      }
    }
    if (end < 0) return null;
    const path: Cell[] = [];
    let s = end;
    while (s >= 0) {
      const c = s >> 2;
      path.push({ gx: (c % w) + this.x0, gy: Math.floor(c / w) + this.y0 });
      s = prev[s]!;
    }
    path.push({ gx: a.gx, gy: a.gy });
    return path.reverse();
  }

  private stepCost(
    c: number,
    d: number,
    x: number,
    y: number,
    a: Obstacle,
    b: Obstacle,
    own: (x: number, y: number, e: Obstacle) => number,
    near: (x: number, y: number, e: Obstacle) => boolean,
  ) {
    const gx = x + this.x0,
      gy = y + this.y0;
    let cost = COST.step + Math.max(0, this.base[c]! - own(gx, gy, a) - own(gx, gy, b));
    // Fanning out of (or into) a block is fine; lanes keep those lines apart.
    if (!near(gx, gy, a) && !near(gx, gy, b)) {
      const same = d < 2 ? this.alongX[c]! : this.alongY[c]!,
        other = d < 2 ? this.alongY[c]! : this.alongX[c]!;
      cost += same * COST.share + (other ? COST.cross : 0);
    }
    return cost;
  }
}
