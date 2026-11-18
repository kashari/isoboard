import { useState } from "react";
import {
  SlidersHorizontal,
  Copy,
  Trash2,
  ChevronDown,
  Move,
  StickyNote,
  Cable,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDiagram } from "@/store/diagram";
import { registry, colors } from "@/nodes/registry";
import { NodeSolid, NodeIcon } from "@/nodes/NodeSolid";
import { EDGE_KINDS, type EdgeStyle, type EdgeKind } from "@/types/diagram";
export function Inspector() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { diagram, selection, selectedEdge, updateNode, updateEdge, duplicate, remove } =
    useDiagram();
  const node = diagram.nodes.find((n) => n.id === selection[0]);
  const edge = diagram.edges.find((e) => e.id === selectedEdge);
  const fromCondition = edge && diagram.nodes.find((n) => n.id === edge.from)?.type === "condition";
  return (
    <>
      <Button
        variant="outline"
        size="icon"
        className="mobile-inspector-toggle"
        title="Selection details"
        aria-label="Selection details"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X /> : <SlidersHorizontal />}
      </Button>
      <aside className={`inspector-panel ${mobileOpen ? "mobile-inspector-open" : ""}`}>
        <div className="panel-heading">
          <div>
            <div className="eyebrow">THE FINER DETAILS</div>
            <h2>Inspector</h2>
          </div>
          <SlidersHorizontal size={17} />
        </div>
        {edge ? (
          <div className="inspector-scroll">
            <div className="selection-card">
              <Cable size={28} />
              <h3>Connection</h3>
              <span className="tiny-chip">{edge.kind.toUpperCase()}</span>
            </div>
            <div className="field-section">
              {fromCondition && (
                <label>
                  BRANCH
                  <select
                    aria-label="Branch"
                    value={["true", "false"].includes(edge.label) ? edge.label : "custom"}
                    onChange={(e) =>
                      updateEdge(edge.id, {
                        label: e.target.value === "custom" ? "otherwise" : e.target.value,
                      })
                    }
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                    <option value="custom">custom…</option>
                  </select>
                </label>
              )}
              {edge.kind === "transition" &&
                (["event", "guard", "action"] as const).map((field) => (
                  <label key={field}>
                    {field.toUpperCase()}
                    <input
                      aria-label={`Transition ${field}`}
                      value={String(edge.data[field] ?? "")}
                      placeholder={
                        field === "event"
                          ? "e.g. submit"
                          : field === "guard"
                            ? "e.g. valid"
                            : "e.g. save()"
                      }
                      onChange={(e) =>
                        updateEdge(edge.id, { data: { ...edge.data, [field]: e.target.value } })
                      }
                    />
                  </label>
                ))}
              <label>
                {edge.kind === "transition" ? "FALLBACK LABEL" : "LABEL"}
                <input
                  aria-label="Edge label"
                  value={edge.label}
                  onChange={(e) => updateEdge(edge.id, { label: e.target.value })}
                />
              </label>
              <label>
                LINE STYLE
                <select
                  aria-label="Edge style"
                  value={edge.style}
                  onChange={(e) => updateEdge(edge.id, { style: e.target.value as EdgeStyle })}
                >
                  {(["solid", "dashed", "dotted", "bidirectional"] as const).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                FLOW KIND
                <select
                  aria-label="Edge kind"
                  value={edge.kind}
                  onChange={(e) => updateEdge(edge.id, { kind: e.target.value as EdgeKind })}
                >
                  {EDGE_KINDS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
            <Button variant="outline" onClick={remove}>
              <Trash2 />
              Delete connection
            </Button>
          </div>
        ) : node ? (
          <>
            <div className="inspector-scroll">
              <div className="selection-card">
                <svg viewBox="-80 -85 160 130" aria-hidden="true">
                  <NodeSolid node={node} preview />
                </svg>
                <div className="selection-card-title">
                  <span>{node.label}</span>
                  <span className={`type-badge color-${node.color}`}>
                    {node.type === "service" ? "SERVICE" : node.type.toUpperCase()}
                  </span>
                </div>
                <span className="selection-description">{registry[node.type].description}</span>
              </div>
              <div className="field-section">
                <div className="section-title">
                  GENERAL <ChevronDown size={13} />
                </div>
                <label>
                  LABEL
                  <input
                    aria-label="Node label"
                    value={node.label}
                    onChange={(e) => updateNode(node.id, { label: e.target.value })}
                  />
                </label>
                <label>
                  SUBLABEL
                  <input
                    aria-label="Node sublabel"
                    value={node.sublabel}
                    placeholder="A little more context"
                    onChange={(e) => updateNode(node.id, { sublabel: e.target.value })}
                  />
                </label>
                <label>COLOR</label>
                <div className="color-swatches">
                  {colors.map((color) => (
                    <Button
                      key={color}
                      variant="ghost"
                      title={color}
                      aria-label={`${color} color`}
                      className={`color-swatch color-${color} ${node.color === color ? "swatch-selected" : ""}`}
                      onClick={() => updateNode(node.id, { color })}
                    >
                      {node.color === color && <span>✓</span>}
                    </Button>
                  ))}
                </div>
                <label>
                  ICON
                  <div className="icon-select">
                    <NodeIcon name={node.icon} size={16} />
                    <select
                      aria-label="Node icon"
                      value={node.icon}
                      onChange={(e) => updateNode(node.id, { icon: e.target.value })}
                    >
                      {[
                        "Server",
                        "Globe",
                        "Database",
                        "Laptop",
                        "UserRound",
                        "Cloud",
                        "Box",
                        "Layers",
                        "Split",
                        "PackageOpen",
                        "StickyNote",
                        "PanelsTopLeft",
                        "Zap",
                        "Shield",
                        "Code",
                        "Cpu",
                        "Network",
                        "Play",
                        "Square",
                        "GitBranch",
                        "Cog",
                        "LogIn",
                        "LogOut",
                        "Timer",
                        "Circle",
                        "CircleDot",
                        "RectangleHorizontal",
                        "Smartphone",
                        "Earth",
                        "BrickWall",
                        "Waypoints",
                        "SquareFunction",
                        "LockKeyhole",
                        "ChartColumnIncreasing",
                        "Mail",
                        "Sparkles",
                        "Bot",
                        "Bell",
                        "ShieldCheck",
                        "Pyramid",
                        "Cone",
                        "Diamond",
                        "Dot",
                        "GitFork",
                        "History",
                        "OctagonX",
                        "SquareStack",
                      ].map((name) => (
                        <option key={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                </label>
                <label>
                  BADGE
                  <input
                    aria-label="Node badge"
                    placeholder="e.g. cached · 5 min"
                    value={String(node.data["badge"] ?? "")}
                    onChange={(e) =>
                      updateNode(node.id, { data: { ...node.data, badge: e.target.value } })
                    }
                  />
                </label>
              </div>
              <div className="field-section">
                <div className="section-title">
                  <span>
                    <Move size={13} />
                    POSITION
                  </span>
                  <ChevronDown size={13} />
                </div>
                <div className="position-inputs">
                  {(["gx", "gy", "gz"] as const).map((key, i) => (
                    <label key={key}>
                      {["X", "Y", "Z"][i]}
                      <input
                        aria-label={`Grid ${key}`}
                        type="number"
                        value={node[key]}
                        onChange={(e) =>
                          updateNode(node.id, { [key]: Math.round(Number(e.target.value)) })
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
              {registry[node.type].inspectorFields.length > 0 && (
                <div className="field-section">
                  <div className="section-title">
                    PROPERTIES
                    <ChevronDown size={13} />
                  </div>
                  {registry[node.type].inspectorFields.map((field) => (
                    <label key={field}>
                      {field.toUpperCase()}
                      <input
                        aria-label={field}
                        value={String(node.data[field] ?? "")}
                        placeholder="Not set"
                        onChange={(e) =>
                          updateNode(node.id, { data: { ...node.data, [field]: e.target.value } })
                        }
                      />
                    </label>
                  ))}
                </div>
              )}
              <div className="field-section">
                <div className="section-title">
                  <span>
                    <StickyNote size={13} />
                    NOTES
                  </span>
                  <ChevronDown size={13} />
                </div>
                <textarea
                  aria-label="Node notes"
                  placeholder="Worth remembering…"
                  value={String(node.data["notes"] ?? "")}
                  onChange={(e) =>
                    updateNode(node.id, { data: { ...node.data, notes: e.target.value } })
                  }
                />
              </div>
            </div>
            <div className="inspector-actions">
              <Button variant="outline" onClick={duplicate}>
                <Copy />
                Duplicate
              </Button>
              <Button
                variant="outline"
                size="icon"
                title="Delete selection"
                aria-label="Delete selection"
                onClick={remove}
              >
                <Trash2 />
              </Button>
            </div>
          </>
        ) : (
          <div className="inspector-empty">
            <svg viewBox="0 0 100 80">
              <path d="M 50 8 L 88 27 L 50 46 L 12 27 Z M 12 27 v 26 l 38 19 38 -19 V 27 M 50 46 v 26" />
            </svg>
            <h3>
              {selection.length > 1
                ? `${selection.length} components selected`
                : "Everything in its place."}
            </h3>
            <span>No component selected</span>
          </div>
        )}
        <div className="inspector-status">
          <span className="status-dot" />
          Saved in this browser
        </div>
      </aside>
    </>
  );
}
