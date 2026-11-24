import { z } from "zod";
import { NODE_TYPES, EDGE_KINDS, LINE_STYLES, type Diagram, type NodeColor } from "@/types/diagram";
import { registry } from "@/nodes/registry";
import { newId } from "@/store/diagram";
import { buildSpec, isSpec } from "./spec";
import { migrateTags, NOTE_COLORS, NOTE_MIN, NOTE_SIZE } from "./notes";
const COLORS = ["amber", "blue", "lavender", "mint", "peach", "stone"] as const;
/** A grid coordinate: numbers (or numeric strings) snapped to the grid; anything else is 0. */
const cell = z.preprocess((v) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 0;
}, z.number().int());
const text = z.preprocess((v) => (v == null ? "" : String(v)), z.string());
const record = z.preprocess(
  (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {}),
  z.record(z.unknown()),
);
const px = (fallback: number) =>
  z.preprocess((v) => {
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  }, z.number());
const note = z.object({
  id: z.preprocess((v) => (v == null || v === "" ? newId() : String(v)), z.string()),
  text: text,
  x: px(0),
  y: px(0),
  w: px(NOTE_SIZE.w).transform((w) => Math.max(NOTE_MIN.w, w)),
  h: px(NOTE_SIZE.h).transform((h) => Math.max(NOTE_MIN.h, h)),
  color: z.enum(NOTE_COLORS).catch("yellow"),
  pin: z.object({ x: z.number().finite(), y: z.number().finite() }).optional().catch(undefined),
  attach: z.preprocess(
    (v) => (v == null || v === "" ? undefined : String(v)),
    z.string().optional(),
  ),
});
const schema = z.object({
  id: z.preprocess((v) => (v == null || v === "" ? newId() : String(v)), z.string()),
  name: z.preprocess((v) => (v == null || v === "" ? "Untitled" : String(v)), z.string()),
  nodes: z.array(
    z
      .object({
        id: z.preprocess((v) => (v == null ? v : String(v)), z.string()),
        type: z.enum(NODE_TYPES),
        gx: cell,
        gy: cell,
        gz: cell,
        label: z.unknown(),
        sublabel: text,
        color: z.unknown(),
        icon: z.unknown(),
        data: record,
      })
      .transform((n) => {
        const entry = registry[n.type];
        return {
          ...n,
          label: n.label == null ? entry.label : String(n.label),
          color: COLORS.includes(n.color as never) ? (n.color as NodeColor) : entry.color,
          icon: typeof n.icon === "string" && n.icon ? n.icon : entry.icon,
        };
      }),
  ),
  edges: z
    .array(
      z.object({
        id: z.preprocess((v) => (v == null ? newId() : String(v)), z.string()),
        from: z.preprocess((v) => (v == null ? v : String(v)), z.string()),
        to: z.preprocess((v) => (v == null ? v : String(v)), z.string()),
        label: text,
        style: z.enum(["solid", "dashed", "dotted", "bidirectional"]).catch("solid"),
        kind: z.enum(EDGE_KINDS).catch("plain"),
        data: record,
      }),
    )
    .default([]),
  viewport: z
    .object({
      x: z.number().catch(0),
      y: z.number().catch(0),
      zoom: z.number().catch(1),
    })
    .catch({ x: 0, y: 0, zoom: 1 })
    .transform((v) =>
      Number.isFinite(v.x) && Number.isFinite(v.y) && v.zoom > 0
        ? { ...v, zoom: Math.min(2.5, Math.max(0.25, v.zoom)) }
        : { x: 0, y: 0, zoom: 1 },
    ),
  steps: z.boolean().optional().catch(undefined),
  lines: z.enum(LINE_STYLES).optional().catch(undefined),
  // A broken note is skipped rather than failing the file.
  notes: z
    .array(z.unknown())
    .optional()
    .catch(undefined)
    .transform((list) =>
      list?.flatMap((n) => {
        const r = note.safeParse(n);
        return r.success ? [r.data] : [];
      }),
    ),
});
/** A spec that can't be built; `message` says what to fix. */
export class SpecError extends Error {}
/** A file that can't be read as a diagram; `message` is shown to the user. */
export class ImportError extends Error {}
/**
 * Parses a diagram from a `.isoboard` file (`{ format: "isoboard", diagram }`), plain JSON, or
 * a diagram spec (`{ format: "isoboard-spec", spec }`, see lib/spec), which is built here.
 */
export function importDiagram(text: string): Diagram {
  let raw: unknown;
  try {
    // Editors on Windows like to start files with a byte-order mark.
    raw = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new ImportError("The file isn't valid JSON (it may be cut off or not a diagram).");
  }
  return importValue(raw);
}
export function importValue(raw: unknown): Diagram {
  if (isSpec(raw)) {
    const built = buildSpec(raw);
    if (!built.diagram) throw new SpecError(built.errors.join("\n"));
    return built.diagram;
  }
  const body =
    raw && typeof raw === "object" && (raw as { format?: unknown }).format === "isoboard"
      ? (raw as { diagram?: unknown }).diagram
      : raw;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    const where = issue.path.length ? ` (at ${issue.path.join(".")})` : "";
    throw new ImportError(`It doesn't look like an Isoboard diagram: ${issue.message}${where}.`);
  }
  const diagram = parsed.data as Diagram;
  const ids = new Set(diagram.nodes.map((n) => n.id));
  if (ids.size !== diagram.nodes.length) throw new ImportError("Two blocks share the same id.");
  // A connector whose end is missing is dropped rather than failing the whole file.
  diagram.edges = diagram.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  // A note attached to a missing block floats free.
  if (diagram.notes)
    diagram.notes = diagram.notes.map((n) =>
      n.attach && !ids.has(n.attach) ? { ...n, attach: undefined, pin: undefined } : n,
    );
  else delete diagram.notes;
  return migrateTags(diagram, newId);
}
