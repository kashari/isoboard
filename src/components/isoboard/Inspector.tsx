import { useState } from "react";
import {
  SlidersHorizontal,
  Copy,
  Trash2,
  ChevronDown,
  Move,
  StickyNote,
  X,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  FlipHorizontal2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDiagram } from "@/store/diagram";
import { registry, colors } from "@/nodes/registry";
import { NodeSolid, NodeIcon } from "@/nodes/NodeSolid";
import { EDGE_KINDS, type EdgeStyle, type EdgeKind } from "@/types/diagram";
import { readRoute, autoRoutes, sameRoute } from "@/lib/routing";
import { NOTE_COLORS, noteRect, pinPoint, placeNote } from "@/lib/notes";
/** Items whose sticker can label a connector: one entry per distinct icon, A–Z. */
const labelItems = [
  ...new Map(Object.values(registry).map((e) => [e.icon, e.label] as const)).entries(),
].sort((a, b) => a[1].localeCompare(b[1]));
export function Inspector() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { diagram, selection, selectedEdge, updateNode, updateEdge, duplicate, remove } =
    useDiagram();
  const node = diagram.nodes.find((n) => n.id === selection[0]);
  const edge = diagram.edges.find((e) => e.id === selectedEdge);
  const { selectedNote, updateNote, commit } = useDiagram();
  const note = diagram.notes?.find((n) => n.id === selectedNote);
  /** Re-ties the note to another block (pointing at its top) or frees it (its line keeps
   * pointing at the same spot); `line: false` drops the line altogether. */
  const attachNote = (to: string, line = true) => {
    if (!note) return;
    const next = placeNote(
      note,
      noteRect(note, diagram.nodes),
      diagram.nodes,
      to || undefined,
      to || !line ? null : undefined,
    );
    commit((d) => ({
      ...d,
      notes: (d.notes ?? []).map((n) => (n.id === note.id ? next : n)),
    }));
  };
  const fromCondition = edge && diagram.nodes.find((n) => n.id === edge.from)?.type === "condition";
  const stepIndex = edge ? diagram.edges.indexOf(edge) : -1;
  const edgeIcon = edge ? String(edge.data["icon"] ?? "") : "";
  const ends = edge && {
    a: diagram.nodes.find((n) => n.id === edge.from),
    b: diagram.nodes.find((n) => n.id === edge.to),
  };
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
          <h2>{note ? "Note" : edge ? "Connection" : node ? "Block" : "Inspector"}</h2>
        </div>
        {note ? (
          <div className="inspector-scroll">
            <div className="field-section">
              <label>
                TEXT
                <textarea
                  aria-label="Note text"
                  className="note-field"
                  placeholder="Write a note… (double-click it on the board too)"
                  value={note.text}
                  onChange={(e) => updateNote(note.id, { text: e.target.value })}
                />
              </label>
              <label>COLOR</label>
              <div className="color-swatches">
                {NOTE_COLORS.map((c) => (
                  <Button
                    key={c}
                    variant="ghost"
                    title={c}
                    aria-label={`${c} note`}
                    className={`color-swatch note-swatch note-${c} ${note.color === c ? "swatch-selected" : ""}`}
                    onClick={() => updateNote(note.id, { color: c })}
                  >
                    {note.color === c && <span>✓</span>}
                  </Button>
                ))}
              </div>
              <label>
                ATTACHED TO
                <select
                  aria-label="Attached to"
                  value={note.attach ?? ""}
                  onChange={(e) => attachNote(e.target.value)}
                >
                  <option value="">Nothing (free note)</option>
                  {diagram.nodes
                    .filter((n) => n.type !== "zone")
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.label || registry[n.type].label}
                      </option>
                    ))}
                </select>
              </label>
              {pinPoint(note, diagram.nodes) && (
                <Button variant="outline" size="sm" onClick={() => attachNote("", false)}>
                  <X />
                  Remove line
                </Button>
              )}
              <span className="selection-description">
                Drag the note to move it and its corners or edges to resize it. Drag the dot at the
                end of its line (or the round handle above it) to any spot on a block or on the
                board.
              </span>
            </div>
            <div className="inspector-actions">
              <Button variant="outline" onClick={remove}>
                <Trash2 />
                Delete note
              </Button>
            </div>
          </div>
        ) : edge ? (
          <div className="inspector-scroll">
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
                LABEL ITEM
                <div className="icon-select">
                  {edgeIcon ? (
                    <NodeIcon name={edgeIcon} size={16} />
                  ) : (
                    <span className="icon-none" />
                  )}
                  <select
                    aria-label="Label item"
                    value={edgeIcon}
                    onChange={(e) => {
                      const { icon: _i, ...rest } = edge.data;
                      updateEdge(edge.id, {
                        data: e.target.value ? { ...rest, icon: e.target.value } : rest,
                      });
                    }}
                  >
                    <option value="">None</option>
                    {labelItems.map(([icon, label]) => (
                      <option key={icon} value={icon}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
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
              <div className="field-label">
                STEP
                <div className="step-row">
                  <span className="step-pill">
                    {stepIndex + 1}
                    <small> of {diagram.edges.length}</small>
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    title="Earlier step"
                    aria-label="Earlier step"
                    disabled={stepIndex <= 0}
                    onClick={() => useDiagram.getState().moveEdgeStep(edge.id, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    title="Later step"
                    aria-label="Later step"
                    disabled={stepIndex >= diagram.edges.length - 1}
                    onClick={() => useDiagram.getState().moveEdgeStep(edge.id, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant={diagram.steps ? "default" : "outline"}
                    size="sm"
                    aria-pressed={!!diagram.steps}
                    onClick={() => useDiagram.getState().toggleSteps()}
                  >
                    {diagram.steps ? "Numbers on" : "Numbers off"}
                  </Button>
                </div>
              </div>
              <div className="field-label">
                LINES
                <span className="field-hint">How every connector on this board is drawn.</span>
                <div className="step-row" role="group" aria-label="Line style">
                  {(
                    [
                      ["sketch", "Hand-drawn"],
                      ["clean", "Clean"],
                    ] as const
                  ).map(([value, label]) => (
                    <Button
                      key={value}
                      variant={(diagram.lines ?? "sketch") === value ? "default" : "outline"}
                      size="sm"
                      aria-pressed={(diagram.lines ?? "sketch") === value}
                      onClick={() => useDiagram.getState().setLines(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="field-label">
                ROUTE
                <span className="field-hint">
                  Drag any part of the connector sideways to re-route it.
                </span>
                <div className="step-row">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!ends?.a || !ends.b}
                    onClick={() => {
                      if (!ends?.a || !ends.b) return;
                      // Turns the corner the other way: an L starting along the other axis.
                      const { bend: _b, route: _r, ...rest } = edge.data;
                      const auto = autoRoutes(
                        diagram.nodes,
                        diagram.edges.map((e) => (e.id === edge.id ? { ...e, data: rest } : e)),
                      ).get(edge.id);
                      const now = readRoute(edge.data) ?? auto;
                      if (!now) return;
                      const flipped = {
                        start: now.start === "x" ? ("y" as const) : ("x" as const),
                        stops: [],
                      };
                      updateEdge(edge.id, {
                        data:
                          auto && sameRoute(ends.a, ends.b, flipped, auto)
                            ? rest
                            : { ...rest, route: flipped },
                      });
                    }}
                  >
                    <FlipHorizontal2 />
                    Flip corner
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!readRoute(edge.data)}
                    onClick={() => {
                      const { bend: _b, route: _r, ...rest } = edge.data;
                      updateEdge(edge.id, { data: rest });
                    }}
                  >
                    <RotateCcw />
                    Reset
                  </Button>
                </div>
              </div>
              <label>
                PRESENTER NOTE
                <textarea
                  aria-label="Presenter note"
                  placeholder="Shown under this step when presenting"
                  value={String(edge.data["note"] ?? "")}
                  onChange={(e) =>
                    updateEdge(edge.id, { data: { ...edge.data, note: e.target.value } })
                  }
                />
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
                        "Spring",
                        "Postgres",
                        "Oracle",
                        "Dolphin",
                        "Leaf",
                        "Redis",
                        "Kafka",
                        "Rabbit",
                        "Elastic",
                        "Helm",
                        "Whale",
                        "Nginx",
                        "File:FILE",
                        "File:PDF",
                        "File:CSV",
                        "File:JSON",
                        "File:XML",
                        "File:XLSX",
                        "File:DOCX",
                        "File:ZIP",
                        "File:IMG",
                        "File:MP4",
                        "File:TXT",
                        "File:YAML",
                        "File:LOG",
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
      </aside>
    </>
  );
}
