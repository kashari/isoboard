import { z } from "zod";
import { NODE_TYPES, EDGE_KINDS, type Diagram } from "@/types/diagram";
import { buildSpec, isSpec } from "./spec";
const schema = z.object({
  id: z.string(),
  name: z.string(),
  nodes: z.array(
    z.object({
      id: z.string(),
      type: z.enum(NODE_TYPES),
      gx: z.number().int(),
      gy: z.number().int(),
      gz: z.number().default(0),
      label: z.string(),
      sublabel: z.string().default(""),
      color: z.enum(["amber", "blue", "lavender", "mint", "peach", "stone"]),
      icon: z.string(),
      data: z.record(z.unknown()).default({}),
    }),
  ),
  edges: z.array(
    z.object({
      id: z.string(),
      from: z.string(),
      to: z.string(),
      label: z.string(),
      style: z.enum(["solid", "dashed", "dotted", "bidirectional"]),
      kind: z.enum(EDGE_KINDS),
      data: z.record(z.unknown()).default({}),
    }),
  ),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number().min(0.25).max(2.5) }),
  steps: z.boolean().optional(),
});
/** A spec that can't be built; `message` says what to fix. */
export class SpecError extends Error {}
/**
 * Parses a diagram from a `.isoboard` file (`{ format: "isoboard", diagram }`), plain JSON, or
 * a diagram spec (`{ format: "isoboard-spec", spec }`, see lib/spec), which is built here.
 */
export function importDiagram(text: string): Diagram {
  return importValue(JSON.parse(text));
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
  const diagram = schema.parse(body);
  const ids = new Set(diagram.nodes.map((n) => n.id));
  if (
    ids.size !== diagram.nodes.length ||
    diagram.edges.some((e) => !ids.has(e.from) || !ids.has(e.to))
  )
    throw new Error("Invalid references");
  return diagram;
}
