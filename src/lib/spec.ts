import type {
  Diagram,
  Edge,
  EdgeKind,
  EdgeStyle,
  Node,
  NodeColor,
  NodeType,
} from "@/types/diagram";
import { NODE_TYPES, EDGE_KINDS } from "@/types/diagram";
import { registry } from "@/nodes/registry";
import { defaultEdge, validate } from "./logic";
import { TAG_COLORS, type TagColor } from "./tags";

/**
 * Diagram specs: a compact description (nodes, zones, `"a -> b: label"` edges) that builds a
 * ready diagram.
 * The editor builds them on open, from a `.isoboard` file (`{ format: "isoboard-spec", spec }`)
 * or from a link (`#spec=…`): every default filled in, a layered auto-layout, zones sized
 * around their members.
 */
export interface SpecNode {
  id: string;
  type: string;
  label?: string;
  sublabel?: string;
  at?: [number, number];
  color?: string;
  icon?: string;
  badge?: string;
  /** A price tag hung on the block: first line headline, more lines small print. */
  tag?: string;
  tagColor?: string;
  data?: Record<string, unknown>;
}
export interface SpecEdge {
  id?: string;
  from: string;
  to: string;
  label?: string;
  style?: string;
  kind?: string;
  icon?: string;
  note?: string;
  event?: string;
  guard?: string;
  action?: string;
  route?: unknown;
  data?: Record<string, unknown>;
}
export interface Spec {
  name?: string;
  steps?: boolean;
  direction?: "x" | "y";
  wrap?: number;
  nodes: SpecNode[];
  zones?: { id?: string; label?: string; contains: string[]; color?: string }[];
  edges?: (string | SpecEdge)[];
}
export interface Built {
  diagram: Diagram | null;
  errors: string[];
  warnings: string[];
}

const COLORS: NodeColor[] = ["amber", "blue", "lavender", "mint", "peach", "stone"];
const STYLES: EdgeStyle[] = ["solid", "dashed", "dotted", "bidirectional"];
const START: NodeType[] = ["initial", "entry", "start"];
/** Cells between neighbouring blocks in the automatic layout. */
const GAP_X = 5,
  GAP_Y = 4;

/** Whether parsed JSON is a spec (rather than a saved diagram). */
export function isSpec(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  if (r["format"] === "isoboard-spec") return true;
  const nodes = r["nodes"];
  return (
    Array.isArray(nodes) &&
    !("viewport" in r) &&
    nodes.every((n) => n && typeof n === "object" && !("gx" in n))
  );
}
/** The spec inside a `{ format: "isoboard-spec", spec }` envelope, or the object itself. */
export const unwrapSpec = (raw: unknown): unknown => {
  const r = raw as Record<string, unknown>;
  return r?.["format"] === "isoboard-spec" ? (r["spec"] ?? r["diagram"] ?? r) : raw;
};

function closest(word: string, options: readonly string[]) {
  const dist = (a: string, b: string) => {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++)
        cur[j] = Math.min(
          prev[j]! + 1,
          cur[j - 1]! + 1,
          prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      prev = cur;
    }
    return prev[b.length]!;
  };
  return [...options].sort((p, q) => dist(word, p) - dist(word, q))[0];
}

/** "a -> b: label", "a --> b" (dashed), "a ..> b" (dotted), "a <-> b" (both ways). */
export function parseEdge(e: string | SpecEdge): SpecEdge | null {
  if (typeof e !== "string") return e && typeof e === "object" ? { ...e } : null;
  const m = e.match(/^\s*([\w.-]+)\s*(<->|-->|\.\.>|->)\s*([\w.-]+)\s*(?::\s*(.*))?$/);
  if (!m) return null;
  const style = { "->": undefined, "-->": "dashed", "..>": "dotted", "<->": "bidirectional" }[
    m[2] as "->"
  ];
  return { from: m[1]!, to: m[3]!, label: (m[4] ?? "").trim(), ...(style ? { style } : {}) };
}
/** "submit [valid] / save()" → { event, guard, action }. */
export function parseTransition(text: string) {
  const m = text.match(/^\s*([^[/]*?)\s*(?:\[([^\]]*)\])?\s*(?:\/\s*(.*))?$/);
  return { event: m?.[1] ?? text, guard: m?.[2] ?? "", action: m?.[3] ?? "" };
}

function newId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID();
  return `spec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Builds a diagram from a spec. `diagram` is null when there are errors. */
export function buildSpec(input: unknown): Built {
  const errors: string[] = [],
    warnings: string[] = [];
  const spec = unwrapSpec(input) as Spec;
  if (!spec || typeof spec !== "object" || !Array.isArray(spec.nodes))
    return { diagram: null, errors: ["The spec needs a `nodes` array"], warnings };

  // ── Nodes ──
  const nodes: Node[] = [];
  const ids = new Set<string>();
  for (const raw of spec.nodes) {
    const type = String(raw?.type) as NodeType;
    if (!NODE_TYPES.includes(type) || type === "zone") {
      errors.push(
        type === "zone"
          ? `Node "${raw.id}": put zones in \`zones\` (they are sized around their members)`
          : `Node "${raw?.id}": unknown type "${raw?.type}" (did you mean "${closest(type, NODE_TYPES)}"?)`,
      );
      continue;
    }
    const id = String(raw.id ?? `${type}-${nodes.length + 1}`);
    if (ids.has(id)) errors.push(`Duplicate node id "${id}"`);
    ids.add(id);
    const t = registry[type];
    const color = (raw.color ?? t.color) as NodeColor;
    if (!COLORS.includes(color))
      errors.push(`Node "${id}": color must be one of ${COLORS.join(", ")}`);
    const data: Record<string, unknown> = { ...(raw.data ?? {}) };
    if (raw.badge) data["badge"] = String(raw.badge);
    if (raw.tag) data["tag"] = String(raw.tag);
    if (raw.tagColor) {
      if (TAG_COLORS.includes(raw.tagColor as TagColor)) data["tagColor"] = raw.tagColor;
      else errors.push(`Node "${id}": tagColor must be one of ${TAG_COLORS.join(", ")}`);
    }
    const at = raw.at;
    const pinned = Array.isArray(at) && at.length === 2 && at.every(Number.isInteger);
    if (at && !pinned) errors.push(`Node "${id}": \`at\` must be two integers [gx, gy]`);
    nodes.push({
      id,
      type,
      gx: pinned ? at[0] : NaN,
      gy: pinned ? at[1] : NaN,
      gz: 0,
      label: String(raw.label ?? t.label),
      sublabel: String(raw.sublabel ?? ""),
      color,
      icon: String(raw.icon ?? t.icon),
      data,
    });
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // ── Edges ──
  const edges: Edge[] = [];
  for (const rawEdge of spec.edges ?? []) {
    const e = parseEdge(rawEdge);
    if (!e) {
      errors.push(
        `Can't read edge ${JSON.stringify(rawEdge)} (use "a -> b: label", "a --> b", "a ..> b" or "a <-> b")`,
      );
      continue;
    }
    const a = byId.get(String(e.from)),
      b = byId.get(String(e.to));
    if (!a || !b) {
      errors.push(`Edge ${e.from} → ${e.to}: unknown node "${!a ? e.from : e.to}"`);
      continue;
    }
    if (a === b) {
      errors.push(`Edge ${e.from} → ${e.to}: a connector needs two different blocks`);
      continue;
    }
    // The editor's own defaults for a connector between these two blocks.
    const def = defaultEdge(a, edges, b);
    const label = String(e.label ?? "") || (a.type === "condition" ? def.label : "");
    const kind = (e.kind ?? def.kind) as EdgeKind;
    const style = (e.style ?? def.style ?? "solid") as EdgeStyle;
    if (!EDGE_KINDS.includes(kind))
      errors.push(`Edge ${e.from} → ${e.to}: kind must be one of ${EDGE_KINDS.join(", ")}`);
    if (!STYLES.includes(style))
      errors.push(`Edge ${e.from} → ${e.to}: style must be one of ${STYLES.join(", ")}`);
    const data: Record<string, unknown> = { ...(def.data ?? {}), ...(e.data ?? {}) };
    if (kind === "transition") {
      const parsed = parseTransition(label);
      for (const k of ["event", "guard", "action"] as const) {
        const v = e[k] ?? parsed[k];
        if (v) data[k] = String(v);
      }
    }
    if (e.icon) data["icon"] = String(e.icon);
    if (e.note) data["note"] = String(e.note);
    if (e.route) data["route"] = e.route;
    edges.push({
      id: String(e.id ?? `e${edges.length + 1}`),
      from: a.id,
      to: b.id,
      label,
      style,
      kind,
      data,
    });
  }
  if (errors.length) return { diagram: null, errors, warnings };

  // ── Layout ──
  const wrap = Number.isInteger(spec.wrap) && spec.wrap! > 1 ? spec.wrap! : 5;
  layout(nodes, edges, spec.direction === "y" ? "y" : "x", wrap);

  // ── Zones ──
  const zones: (Node & { members?: Set<string> })[] = [];
  for (const z of spec.zones ?? []) {
    const members = (z.contains ?? []).map((id) => byId.get(String(id)));
    if (!members.length || members.some((m) => !m)) {
      errors.push(`Zone "${z.label}": \`contains\` must list existing node ids`);
      continue;
    }
    const gxs = members.map((m) => m!.gx),
      gys = members.map((m) => m!.gy);
    // A zone is drawn from cell (gx-1, gy-1), `width` cells along gx and `height` along gy.
    const color = (z.color ?? "blue") as NodeColor;
    if (!COLORS.includes(color))
      errors.push(`Zone "${z.label}": color must be one of ${COLORS.join(", ")}`);
    zones.push({
      members: new Set(z.contains.map(String)),
      id: String(z.id ?? `zone-${zones.length + 1}`),
      type: "zone",
      gx: Math.min(...gxs) - 1,
      gy: Math.min(...gys) - 1,
      gz: 0,
      label: String(z.label ?? "ZONE").toUpperCase(),
      sublabel: "",
      color,
      icon: "PanelsTopLeft",
      data: {
        width: Math.max(...gxs) - Math.min(...gxs) + 5,
        height: Math.max(...gys) - Math.min(...gys) + 5,
      },
    });
  }
  // Blocks that aren't in a zone but landed inside it: auto-placed ones move out past its
  // nearer edge (along gy); pinned ones (`at`) only get a warning.
  const pinned = new Set(spec.nodes.filter((n) => n.at).map((n) => String(n.id)));
  for (const z of zones) {
    const w = Number(z.data["width"]),
      h = Number(z.data["height"]);
    const inside = (n: Node) =>
      n.gx >= z.gx - 1 && n.gx <= z.gx + w - 1 && n.gy >= z.gy - 1 && n.gy <= z.gy + h - 1;
    for (const n of nodes) {
      if (z.members!.has(n.id) || !inside(n)) continue;
      if (pinned.has(n.id)) {
        warnings.push(`Block "${n.id}" sits inside zone "${z.label}" but isn't one of its members`);
        continue;
      }
      const up = z.gy - 3,
        down = z.gy + h + 1;
      const options = (n.gy - up <= down - n.gy ? [up, down] : [down, up]).flatMap((y0) =>
        [0, 1, 2, 3].map((k) => y0 + (y0 === up ? -k : k) * GAP_Y),
      );
      n.gy =
        options.find(
          (y) => !nodes.some((m) => m !== n && Math.abs(m.gx - n.gx) < 3 && Math.abs(m.gy - y) < 3),
        ) ?? options[0]!;
    }
    delete z.members;
  }
  if (errors.length) return { diagram: null, errors, warnings };

  // Spacing: blocks (and their names) need room.
  const blocks = nodes.filter((n) => n.type !== "note");
  for (let i = 0; i < blocks.length; i++)
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i]!,
        b = blocks[j]!;
      const d = Math.max(Math.abs(a.gx - b.gx), Math.abs(a.gy - b.gy));
      if (d === 0) errors.push(`Blocks "${a.id}" and "${b.id}" are on the same cell`);
      else if (d < 3) warnings.push(`Blocks "${a.id}" and "${b.id}" are only ${d} cell(s) apart`);
    }
  if (errors.length) return { diagram: null, errors, warnings };

  const diagram: Diagram = {
    id: newId(),
    name: String(spec.name ?? "Untitled diagram"),
    nodes: [...zones, ...nodes],
    edges,
    // {0, 0} makes the editor fit the diagram to the screen when it opens.
    viewport: { x: 0, y: 0, zoom: 1 },
    ...(spec.steps ? { steps: true } : {}),
  };
  warnings.push(...validate(diagram).map((i) => i.message));
  return { diagram, errors, warnings };
}

/**
 * Layered layout for nodes without `at`: rank = longest path from a start along the main axis
 * (back edges of cycles ignored), each rank ordered by the average position of the blocks
 * feeding it so lines cross as little as possible, and long chains folded into snake rows.
 */
function layout(nodes: Node[], edges: Edge[], dir: "x" | "y", maxPerRow: number) {
  const free = nodes.filter((n) => Number.isNaN(n.gx));
  if (!free.length) return;
  const ids = nodes.map((n) => n.id);
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  const state = new Map<string, number>();
  const forward: Edge[] = [];
  const visit = (id: string) => {
    state.set(id, 1);
    for (const e of edges.filter((x) => x.from === id)) {
      const s = state.get(e.to);
      if (s === 1) continue; // back edge: cycles (state machines!) still layer
      forward.push(e);
      if (!s) visit(e.to);
    }
    state.set(id, 2);
  };
  const indeg = new Map(ids.map((id) => [id, 0]));
  for (const e of edges) indeg.set(e.to, indeg.get(e.to)! + 1);
  const startRank = (n: Node) => (START.includes(n.type) ? 0 : indeg.get(n.id) === 0 ? 1 : 2);
  for (const n of [...nodes].sort((a, b) => startRank(a) - startRank(b)))
    if (!state.get(n.id)) visit(n.id);
  const seen = new Set<string>();
  for (const e of forward) {
    const k = `${e.from}>${e.to}`;
    if (!seen.has(k)) {
      out.get(e.from)!.push(e.to);
      seen.add(k);
    }
  }
  const rank = new Map(ids.map((id) => [id, 0]));
  const inF = new Map(ids.map((id) => [id, 0]));
  for (const tos of out.values()) for (const t of tos) inF.set(t, inF.get(t)! + 1);
  const queue = ids.filter((id) => inF.get(id) === 0);
  while (queue.length) {
    const id = queue.shift()!;
    for (const t of out.get(id)!) {
      rank.set(t, Math.max(rank.get(t)!, rank.get(id)! + 1));
      inF.set(t, inF.get(t)! - 1);
      if (inF.get(t) === 0) queue.push(t);
    }
  }
  const layers: Node[][] = [];
  for (const n of nodes) (layers[rank.get(n.id)!] ??= []).push(n);
  const pos = new Map<string, number>();
  const place = (layer: Node[]) =>
    layer.forEach((n, i) => pos.set(n.id, i - (layer.length - 1) / 2));
  layers.forEach((l) => l && place(l));
  const preds = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const [f, tos] of out) for (const t of tos) preds.get(t)!.push(f);
  for (let sweep = 0; sweep < 4; sweep++)
    for (const layer of layers) {
      if (!layer) continue;
      const bary = (n: Node) => {
        const p = preds.get(n.id)!;
        return p.length ? p.reduce((s, id) => s + pos.get(id)!, 0) / p.length : pos.get(n.id)!;
      };
      layer.sort((a, b) => bary(a) - bary(b));
      place(layer);
    }
  // A layer or so over the limit stays on one row; longer chains split into balanced rows,
  // each running back the way the last one came (a snake).
  let wrap = maxPerRow;
  if (layers.length > wrap + 1) wrap = Math.ceil(layers.length / Math.ceil(layers.length / wrap));
  else wrap = Math.max(wrap, layers.length);
  const rows = Math.max(1, Math.ceil(layers.length / wrap));
  const rowBase: number[] = [];
  let base = 0;
  for (let r = 0; r < rows; r++) {
    const span = layers.slice(r * wrap, (r + 1) * wrap).map((l) => (l?.length ?? 1) - 1);
    const half = (Math.max(0, ...span) / 2) * GAP_Y;
    base += r ? half + GAP_Y + 1 : 0;
    rowBase.push(Math.round(base));
    base += half;
  }
  const taken = nodes.filter((n) => !Number.isNaN(n.gx));
  const along = (m: Node) => (dir === "x" ? m.gx : m.gy),
    across = (m: Node) => (dir === "x" ? m.gy : m.gx);
  for (const n of free) {
    const r = rank.get(n.id)!,
      row = Math.floor(r / wrap),
      col = row % 2 ? wrap - 1 - (r % wrap) : r % wrap;
    const main = col * GAP_X;
    let cross = rowBase[row]! + Math.round(pos.get(n.id)! * GAP_Y);
    // Keep clear of blocks the spec pinned with `at`.
    for (
      let tries = 0;
      tries < 50 &&
      taken.some((m) => Math.abs(along(m) - main) < 3 && Math.abs(across(m) - cross) < 3);
      tries++
    )
      cross += GAP_Y;
    [n.gx, n.gy] = dir === "x" ? [main, cross] : [cross, main];
    taken.push(n);
  }
}

// ── Links: https://…/isoboard/#spec=… ──

function fromBase64Url(text: string) {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function inflate(bytes: Uint8Array) {
  for (const format of ["deflate", "deflate-raw", "gzip"] as const) {
    try {
      const stream = new Response(bytes as BodyInit).body!.pipeThrough(
        new DecompressionStream(format),
      );
      return await new Response(stream).text();
    } catch {
      /* try the next format */
    }
  }
  throw new Error("Can't decompress the link");
}
/**
 * The JSON a `#spec=` (or `#diagram=`) link carries. The value may be URL-encoded JSON,
 * base64url JSON, or base64url of deflate/zlib/gzip-compressed JSON.
 */
export async function readHashPayload(hash: string): Promise<unknown | null> {
  const m = hash.match(/^#?(spec|diagram|isoboard)=(.+)$/s);
  if (!m) return null;
  const value = m[2]!;
  let text: string | null = null;
  try {
    const plain = decodeURIComponent(value);
    if (plain.trimStart().startsWith("{")) text = plain;
  } catch {
    /* not URL-encoded JSON */
  }
  if (text === null) {
    const bytes = fromBase64Url(decodeURIComponent(value).trim());
    const head = new TextDecoder().decode(bytes.slice(0, 1));
    text = head === "{" ? new TextDecoder().decode(bytes) : await inflate(bytes);
  }
  return JSON.parse(text);
}
