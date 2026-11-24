import { useState } from "react";
import { Search, ChevronDown, GripVertical, PanelLeftClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { registry, paletteGroupOrder, previewBox } from "@/nodes/registry";
import { NodeSolid } from "@/nodes/NodeSolid";
import { useDiagram } from "@/store/diagram";
import { addNodeInView } from "./add-node";
import type { NodeType } from "@/types/diagram";
export function Palette({ onHide }: { onHide: () => void }) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const mode = useDiagram((s) => s.mode);
  const entries = (Object.entries(registry) as [NodeType, typeof registry.service][]).filter(
    ([, e]) => e.modes.includes(mode),
  );
  const rank = (g: string) => {
    const i = paletteGroupOrder.indexOf(g);
    return i < 0 ? paletteGroupOrder.length : i;
  };
  const groups = [...new Set(entries.map(([, e]) => e.paletteGroup))].sort(
    (a, b) => rank(a) - rank(b),
  );
  return (
    <aside className="palette-panel">
      <div className="panel-heading">
        <h2>Components</h2>
        <Button
          variant="ghost"
          size="icon"
          title="Hide components ( [ )"
          aria-label="Hide components"
          onClick={onHide}
        >
          <PanelLeftClose />
        </Button>
      </div>
      <div className="search-field">
        <Search size={15} />
        <input
          aria-label="Search components"
          placeholder="Find a component…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <kbd>/</kbd>
      </div>
      <div className="palette-scroll">
        {groups.map((group) => {
          const items = entries.filter(
            ([, e]) =>
              e.paletteGroup === group &&
              (e.label + " " + e.description).toLowerCase().includes(search.toLowerCase()),
          );
          if (!items.length) return null;
          return (
            <section key={group} className="palette-group">
              <Button
                variant="ghost"
                className="group-label"
                onClick={() =>
                  setCollapsed(
                    collapsed.includes(group)
                      ? collapsed.filter((g) => g !== group)
                      : [...collapsed, group],
                  )
                }
              >
                <span>{group}</span>
                <ChevronDown size={13} className={collapsed.includes(group) ? "rotate-180" : ""} />
              </Button>
              {!collapsed.includes(group) && (
                <div className="palette-grid">
                  {items.map(([type, entry]) => (
                    <Button
                      key={type}
                      variant="ghost"
                      className="palette-item"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("isoboard-node", type);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => addNodeInView(type)}
                    >
                      <GripVertical className="palette-grip" />
                      <svg
                        viewBox={previewBox(type, [-65, -85, 130, 140])}
                        className="palette-preview"
                        aria-hidden="true"
                      >
                        <NodeSolid
                          preview
                          node={{
                            id: "preview",
                            type,
                            gx: 0,
                            gy: 0,
                            gz: 0,
                            label: "",
                            sublabel: "",
                            color: entry.color,
                            icon: entry.icon,
                            data: type === "zone" ? { width: 2, height: 2 } : entry.defaultData,
                          }}
                        />
                      </svg>
                      <span>{entry.label}</span>
                    </Button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
        {search &&
          !entries.some(([, e]) =>
            (e.label + " " + e.description).toLowerCase().includes(search.toLowerCase()),
          ) && <div className="empty-results">No components found.</div>}
      </div>
    </aside>
  );
}
