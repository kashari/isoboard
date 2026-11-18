import { registry } from "@/nodes/registry";
import { useDiagram, newId } from "@/store/diagram";
import { freeCell, viewCenterCell } from "@/lib/isometric";
import type { NodeType } from "@/types/diagram";

/** Adds a registry block at the nearest free spot in the middle of the current view. */
export function addNodeInView(type: NodeType) {
  const entry = registry[type];
  const { diagram, addNode } = useDiagram.getState();
  const rect = document.querySelector(".diagram-canvas")?.getBoundingClientRect();
  const center = rect
    ? viewCenterCell(diagram.viewport, rect.width, rect.height)
    : { gx: 0, gy: 0 };
  const { gx, gy } = freeCell(diagram.nodes, center.gx, center.gy);
  addNode({
    id: newId(),
    type,
    gx,
    gy,
    gz: 0,
    label: entry.label,
    sublabel: "",
    color: entry.color,
    icon: entry.icon,
    data: { ...entry.defaultData },
  });
}
