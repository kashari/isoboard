import { useState } from "react";
import { Search, Plus, X, FolderOpen, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { registry } from "@/nodes/registry";
import { useDiagram } from "@/store/diagram";
import { addNodeInView } from "./add-node";
import { NodeIcon } from "@/nodes/NodeSolid";
import type { NodeType } from "@/types/diagram";
export function CommandPalette({
  onClose,
  onProjects,
}: {
  onClose: () => void;
  onProjects: () => void;
}) {
  const [search, setSearch] = useState("");
  const { dark, diagram, select } = useDiagram();
  return (
    <div className="modal-shade" onClick={onClose}>
      <div
        className="command-modal panel"
        role="dialog"
        aria-modal="true"
        aria-label="Quick search"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="command-search">
          <Search size={20} />
          <input
            autoFocus
            placeholder="Find a component, node, or action…"
            aria-label="Command search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
          />
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close search">
            <X />
          </Button>
        </div>
        <div className="command-results">
          <span className="eyebrow">COMPONENTS</span>
          {(Object.entries(registry) as [NodeType, typeof registry.service][])
            .filter(([, r]) => r.label.toLowerCase().includes(search.toLowerCase()))
            .map(([type, r]) => (
              <Button
                key={type}
                variant="ghost"
                onClick={() => {
                  addNodeInView(type);
                  onClose();
                }}
              >
                <NodeIcon name={r.icon} size={17} />
                {r.label}
                <Plus size={14} />
              </Button>
            ))}
          <span className="eyebrow">ON THE CANVAS</span>
          {diagram.nodes
            .filter((n) => n.label.toLowerCase().includes(search.toLowerCase()))
            .map((n) => (
              <Button
                key={n.id}
                variant="ghost"
                onClick={() => {
                  select([n.id]);
                  onClose();
                }}
              >
                <NodeIcon name={n.icon} size={17} />
                {n.label}
              </Button>
            ))}
          <span className="eyebrow">ACTIONS</span>
          <Button
            variant="ghost"
            onClick={() => {
              onProjects();
              onClose();
            }}
          >
            <FolderOpen />
            Open my projects
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              useDiagram.setState({ dark: !dark });
              onClose();
            }}
          >
            {dark ? <Sun /> : <Moon />}Switch to {dark ? "light" : "dark"} theme
          </Button>
        </div>
      </div>
    </div>
  );
}
