import { z } from "zod";
import { NODE_TYPES, EDGE_KINDS, type Diagram } from "@/types/diagram";
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
});
export function importDiagram(text: string): Diagram {
  const diagram = schema.parse(JSON.parse(text));
  const ids = new Set(diagram.nodes.map((n) => n.id));
  if (
    ids.size !== diagram.nodes.length ||
    diagram.edges.some((e) => !ids.has(e.from) || !ids.has(e.to))
  )
    throw new Error("Invalid references");
  return diagram;
}
