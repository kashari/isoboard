import { useCallback, useEffect, useRef, useState } from "react";
import { select } from "d3-selection";
import { zoom, zoomIdentity, zoomTransform, type ZoomBehavior } from "d3-zoom";
import { Minus, Plus, Scan, MousePointer2, Hand, Cable, Play, Pause, Grid2X2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDiagram, newId } from "@/store/diagram";
import { registry } from "@/nodes/registry";
import { project, unproject, depthSort, edgePoints } from "@/lib/isometric";
import { edgeText } from "@/lib/logic";
import { ValidationPanel } from "./ValidationPanel";
import type { Node, NodeType } from "@/types/diagram";

// The grid never changes, so build it once as a single path instead of 258 elements per render.
const GRID_PATH = Array.from({ length: 129 }, (_, k) => k - 64)
  .map((i) => {
    const a = project(i, -32),
      b = project(i, 32),
      c = project(-32, i),
      d = project(32, i);
    return `M ${a.x} ${a.y} L ${b.x} ${b.y} M ${c.x} ${c.y} L ${d.x} ${d.y}`;
  })
  .join(" ");
const transformAttr = (v: { x: number; y: number; zoom: number }) =>
  `translate(${v.x} ${v.y}) scale(${v.zoom})`;
interface DragState {
  id: string;
  x: number;
  y: number;
  positions: Node[];
  moved: boolean;
}
export function Canvas() {
  const {
    diagram,
    selection,
    selectedEdge,
    playing,
    select: selectNodes,
    commit,
    addNode,
    addEdge,
    setViewport,
    mode,
  } = useDiagram();
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>(null);
  const viewport = useRef(diagram.viewport);
  const drag = useRef<DragState | null>(null);
  const space = useRef(false);
  const [tool, setTool] = useState<"select" | "pan" | "connect">("select");
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const [grid, setGrid] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [marquee, setMarquee] = useState<{
    x: number;
    y: number;
    endX: number;
    endY: number;
  } | null>(null);
  const marqueeRef = useRef(marquee);
  marqueeRef.current = marquee;
  const [moving, setMoving] = useState<Node[] | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const flowRef = useRef<SVGGElement>(null);
  const sceneRef = useRef<SVGGElement>(null);
  // During pan/zoom the live transform lives in `viewport` and is written straight to the DOM;
  // the store only receives it when the gesture ends. Adopt the store value whenever it changes
  // from outside (project switch, undo/redo).
  const storeViewport = useRef(diagram.viewport);
  if (storeViewport.current !== diagram.viewport) {
    storeViewport.current = diagram.viewport;
    viewport.current = diagram.viewport;
  }
  const fit = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || !zoomRef.current) return;
    const { width, height } = svg.getBoundingClientRect();
    const nodes = useDiagram.getState().diagram.nodes.filter((n) => n.type !== "zone");
    const points = nodes.map((n) => project(n.gx, n.gy));
    const minX = points.length ? Math.min(...points.map((p) => p.x)) - 100 : -350;
    const maxX = points.length ? Math.max(...points.map((p) => p.x)) + 100 : 350;
    const minY = points.length ? Math.min(...points.map((p) => p.y)) - 135 : -200;
    const maxY = points.length ? Math.max(...points.map((p) => p.y)) + 120 : 200;
    const scale = Math.max(
      0.35,
      Math.min(1.45, (width - 110) / (maxX - minX), (height - 200) / (maxY - minY)),
    );
    select(svg).call(
      zoomRef.current.transform,
      zoomIdentity
        .translate(
          width / 2 - ((minX + maxX) / 2) * scale,
          height / 2 - ((minY + maxY) / 2) * scale - 25,
        )
        .scale(scale),
    );
  }, []);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 2.5])
      .filter(
        (e) =>
          e.type === "wheel" ||
          e.type.startsWith("touch") ||
          e.button === 1 ||
          space.current ||
          toolRef.current === "pan",
      )
      .on("zoom", (e) => {
        viewport.current = { x: e.transform.x, y: e.transform.y, zoom: e.transform.k };
        sceneRef.current?.setAttribute("transform", transformAttr(viewport.current));
      })
      .on("end", () => setViewport(viewport.current));
    zoomRef.current = behavior;
    select(svg).call(behavior).on("dblclick.zoom", null);
    const v = useDiagram.getState().diagram.viewport;
    if (v.x === 0 && v.y === 0) fit();
    else select(svg).call(behavior.transform, zoomIdentity.translate(v.x, v.y).scale(v.zoom));
    return () => {
      select(svg).on(".zoom", null);
    };
  }, [diagram.id, fit, setViewport]);
  useEffect(() => {
    // Keep d3's internal transform in sync when the store viewport changes without a gesture
    // (e.g. undo restores an older viewport); otherwise the next pan would jump back.
    const svg = svgRef.current;
    const v = diagram.viewport;
    if (!svg) return;
    const t = zoomTransform(svg);
    if (t.x !== v.x || t.y !== v.y || t.k !== v.zoom)
      select(svg).property("__zoom", zoomIdentity.translate(v.x, v.y).scale(v.zoom));
  }, [diagram.viewport]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        space.current = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") space.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  useEffect(() => {
    if (!playing || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const animate = (t: number) => {
      flowRef.current
        ?.querySelectorAll<SVGCircleElement>("circle[data-path]")
        .forEach((circle, index) => {
          const path = svgRef.current?.querySelector<SVGPathElement>(`#${circle.dataset["path"]}`);
          if (!path) return;
          const length = path.getTotalLength();
          const p = path.getPointAtLength((t * 0.045 + index * 47) % Math.max(length, 1));
          circle.setAttribute("cx", String(p.x));
          circle.setAttribute("cy", String(p.y));
        });
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [playing, diagram.edges, diagram.nodes]);
  function coordinates(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - viewport.current.x) / viewport.current.zoom,
      y: (clientY - rect.top - viewport.current.y) / viewport.current.zoom,
    };
  }
  function startDrag(e: React.PointerEvent<SVGGElement>, node: Node) {
    if (e.button !== 0 || space.current || tool === "pan") return;
    e.stopPropagation();
    if (tool === "connect") {
      setConnecting(node.id);
      setPointer(project(node.gx, node.gy));
      return;
    }
    const ids = e.shiftKey
      ? selection.includes(node.id)
        ? selection.filter((id) => id !== node.id)
        : [...selection, node.id]
      : selection.includes(node.id)
        ? selection
        : [node.id];
    selectNodes(ids);
    const p = coordinates(e.clientX, e.clientY);
    drag.current = {
      id: node.id,
      x: p.x,
      y: p.y,
      positions: diagram.nodes.filter((n) => ids.includes(n.id)),
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent<SVGSVGElement>) {
    // Only track the pointer in state while drawing a connection — setting it on every move
    // re-rendered the whole canvas just from hovering.
    if (!connecting && !drag.current && !marqueeRef.current) return;
    const p = coordinates(e.clientX, e.clientY);
    if (connecting) setPointer(p);
    if (drag.current) {
      const d = drag.current;
      const delta = unproject(p.x - d.x, p.y - d.y);
      const gx = Math.round(delta.gx),
        gy = Math.round(delta.gy);
      if (gx || gy) d.moved = true;
      setMoving(d.positions.map((n) => ({ ...n, gx: n.gx + gx, gy: n.gy + gy })));
    } else if (marqueeRef.current) setMarquee({ ...marqueeRef.current, endX: p.x, endY: p.y });
  }
  function finish(e: React.PointerEvent<SVGSVGElement>) {
    if (drag.current && moving && drag.current.moved) {
      commit((d) => ({ ...d, nodes: d.nodes.map((n) => moving.find((m) => m.id === n.id) ?? n) }));
    }
    drag.current = null;
    setMoving(null);
    if (connecting) {
      const p = coordinates(e.clientX, e.clientY);
      const nearest = diagram.nodes
        .filter((n) => n.id !== connecting && n.type !== "zone")
        .find((n) => {
          const q = project(n.gx, n.gy);
          return Math.hypot(q.x - p.x, q.y - p.y) < 80;
        });
      if (nearest) addEdge(connecting, nearest.id);
      setConnecting(null);
    }
    if (marquee) {
      const { x, y, endX, endY } = marquee;
      const ids = diagram.nodes
        .filter((n) => {
          const p = project(n.gx, n.gy);
          return (
            p.x >= Math.min(x, endX) &&
            p.x <= Math.max(x, endX) &&
            p.y >= Math.min(y, endY) &&
            p.y <= Math.max(y, endY)
          );
        })
        .map((n) => n.id);
      selectNodes(e.shiftKey ? [...new Set([...selection, ...ids])] : ids);
      setMarquee(null);
    }
  }
  function adjustZoom(factor: number) {
    const svg = svgRef.current;
    if (svg && zoomRef.current) select(svg).call(zoomRef.current.scaleBy, factor);
  }
  const nodes = moving
    ? diagram.nodes.map((n) => moving.find((m) => m.id === n.id) ?? n)
    : diagram.nodes;
  return (
    <main className={`canvas-area tool-${tool}`}>
      <div className="canvas-toolbar panel">
        <Button
          title="Select"
          aria-label="Select tool"
          variant="ghost"
          size="icon"
          className={tool === "select" ? "tool-active" : ""}
          onClick={() => setTool("select")}
        >
          <MousePointer2 />
        </Button>
        <Button
          title="Pan"
          aria-label="Pan tool"
          variant="ghost"
          size="icon"
          className={tool === "pan" ? "tool-active" : ""}
          onClick={() => setTool("pan")}
        >
          <Hand />
        </Button>
        <Button
          title="Connect nodes"
          aria-label="Connect tool"
          variant="ghost"
          size="icon"
          className={tool === "connect" ? "tool-active" : ""}
          onClick={() => setTool("connect")}
        >
          <Cable />
        </Button>
        <span className="toolbar-divider" />
        <Button
          title={playing ? "Pause flow" : "Play flow"}
          aria-label={playing ? "Pause flow" : "Play flow"}
          variant="ghost"
          size="icon"
          onClick={() => useDiagram.setState({ playing: !playing })}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <Button
          title="Toggle grid"
          aria-label="Toggle grid"
          variant="ghost"
          size="icon"
          onClick={() => setGrid(!grid)}
        >
          <Grid2X2 />
        </Button>
      </div>
      <svg
        ref={svgRef}
        className="diagram-canvas"
        aria-label="Isometric diagram canvas"
        onPointerMove={move}
        onPointerUp={finish}
        onPointerDown={(e) => {
          if (e.button !== 0 || space.current || tool === "pan") return;
          const p = coordinates(e.clientX, e.clientY);
          if (!e.shiftKey) selectNodes([]);
          setMarquee({ x: p.x, y: p.y, endX: p.x, endY: p.y });
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const type = e.dataTransfer.getData("isoboard-node") as NodeType;
          const entry = registry[type];
          if (!entry) return;
          const p = coordinates(e.clientX, e.clientY),
            g = unproject(p.x, p.y);
          addNode({
            id: newId(),
            type,
            gx: Math.round(g.gx),
            gy: Math.round(g.gy),
            gz: 0,
            label: entry.label,
            sublabel: "",
            color: entry.color,
            icon: entry.icon,
            data: { ...entry.defaultData },
          });
        }}
      >
        <defs>
          <marker
            id="arrow-end"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 1 1 L 9 5 L 1 9" className="arrow-tip" />
          </marker>
        </defs>
        <g ref={sceneRef} transform={transformAttr(viewport.current)}>
          {grid && (
            <g className="iso-grid">
              <path d={GRID_PATH} />
            </g>
          )}
          {depthSort(nodes)
            .filter((n) => n.type === "zone")
            .map((n) => {
              const p = project(n.gx, n.gy, n.gz);
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x} ${p.y})`}
                  onPointerDown={(e) => startDrag(e, n)}
                >
                  <registry.zone.component node={n} />
                </g>
              );
            })}
          {diagram.edges.map((edge) => {
            const a = nodes.find((n) => n.id === edge.from),
              b = nodes.find((n) => n.id === edge.to);
            if (!a || !b) return null;
            const pts = edgePoints(a, b);
            const path = `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y} L ${pts[2].x} ${pts[2].y}`;
            const l1 = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
              l2 = Math.hypot(pts[2].x - pts[1].x, pts[2].y - pts[1].y);
            const ratio = (l1 + l2) / 2;
            const mid =
              ratio <= l1
                ? {
                    x: pts[0].x + (pts[1].x - pts[0].x) * (ratio / (l1 || 1)),
                    y: pts[0].y + (pts[1].y - pts[0].y) * (ratio / (l1 || 1)),
                  }
                : {
                    x: pts[1].x + (pts[2].x - pts[1].x) * ((ratio - l1) / (l2 || 1)),
                    y: pts[1].y + (pts[2].y - pts[1].y) * ((ratio - l1) / (l2 || 1)),
                  };
            const text = edgeText(edge);
            const w = text.length * 6.5 + 20;
            return (
              <g
                key={edge.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  selectNodes([], edge.id);
                }}
                className={`diagram-edge ${edge.id === selectedEdge ? "edge-selected" : ""}`}
              >
                <path className="edge-hit" d={path} />
                <path
                  id={`path-${edge.id}`}
                  className="edge-line"
                  d={path}
                  strokeDasharray={
                    edge.style === "dashed" ? "7 5" : edge.style === "dotted" ? "1 6" : undefined
                  }
                  markerEnd="url(#arrow-end)"
                  markerStart={edge.style === "bidirectional" ? "url(#arrow-end)" : undefined}
                />
                {/* State-machine transitions are drawn without a label chip; a guarded
                    transition just gets a small diamond marker at its midpoint. */}
                {edge.kind === "transition" && String(edge.data["guard"] ?? "").trim() && (
                  <path
                    className="guard-pip"
                    d={`M ${mid.x} ${mid.y - 7} L ${mid.x + 7} ${mid.y} L ${mid.x} ${mid.y + 7} L ${mid.x - 7} ${mid.y} Z`}
                  >
                    <title>{`[${String(edge.data["guard"])}]`}</title>
                  </path>
                )}
                {edge.kind !== "transition" && (
                  <g transform={`translate(${mid.x - w / 2} ${mid.y - 29})`}>
                    <rect className="edge-chip" width={w} height="23" rx="11.5" />
                    <text className="edge-label" x={w / 2} y="15.5" textAnchor="middle">
                      {text}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
          <g ref={flowRef}>
            {diagram.edges.map((edge) => (
              <circle
                key={edge.id}
                data-path={`path-${edge.id}`}
                className={`flow-dot flow-${edge.kind}`}
                r="4"
                cx={
                  project(
                    nodes.find((n) => n.id === edge.from)?.gx ?? 0,
                    nodes.find((n) => n.id === edge.from)?.gy ?? 0,
                  ).x
                }
                cy={
                  project(
                    nodes.find((n) => n.id === edge.from)?.gx ?? 0,
                    nodes.find((n) => n.id === edge.from)?.gy ?? 0,
                  ).y
                }
              />
            ))}
          </g>
          {depthSort(nodes)
            .filter((n) => n.type !== "zone")
            .map((n) => {
              const p = project(n.gx, n.gy, n.gz);
              const Shape = registry[n.type].component;
              const selected = selection.includes(n.id);
              return (
                <g
                  key={n.id}
                  aria-label={`Node ${n.label}`}
                  role="graphics-symbol"
                  className={`diagram-node ${selected ? "selected" : ""}`}
                  transform={`translate(${p.x} ${p.y})`}
                  onPointerDown={(e) => startDrag(e, n)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setRenaming(n.id);
                    setRenameText(n.label);
                  }}
                >
                  {selected && (
                    <path className="selection-ground" d="M 0 -50 L 63 -18 L 0 30 L -63 -2 Z" />
                  )}
                  <Shape node={n} />
                  <circle
                    className="connection-handle"
                    cx="51"
                    cy="-8"
                    r="6"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setConnecting(n.id);
                      setPointer(p);
                    }}
                  />
                  <circle className="connection-center" cx="51" cy="-8" r="2" />
                  {renaming === n.id && (
                    <foreignObject x="-95" y="33" width="190" height="36">
                      <input
                        autoFocus
                        className="inline-rename"
                        aria-label="Rename node"
                        value={renameText}
                        onChange={(e) => setRenameText(e.target.value)}
                        onPointerDown={(e) => e.stopPropagation()}
                        onBlur={() => {
                          useDiagram.getState().updateNode(n.id, { label: renameText });
                          setRenaming(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") setRenaming(null);
                        }}
                      />
                    </foreignObject>
                  )}
                </g>
              );
            })}
          {connecting && (
            <path
              className="connecting-line"
              d={`M ${project(nodes.find((n) => n.id === connecting)?.gx ?? 0, nodes.find((n) => n.id === connecting)?.gy ?? 0).x} ${project(nodes.find((n) => n.id === connecting)?.gx ?? 0, nodes.find((n) => n.id === connecting)?.gy ?? 0).y} L ${pointer.x} ${pointer.y}`}
            />
          )}
          {marquee && (
            <rect
              className="marquee"
              x={Math.min(marquee.x, marquee.endX)}
              y={Math.min(marquee.y, marquee.endY)}
              width={Math.abs(marquee.endX - marquee.x)}
              height={Math.abs(marquee.endY - marquee.y)}
            />
          )}
        </g>
      </svg>
      {diagram.nodes.length === 0 && (
        <div className="canvas-empty">
          <svg viewBox="0 0 72 60" aria-hidden="true">
            <path d="M 36 4 L 68 20 L 36 36 L 4 20 Z M 4 20 v 18 l 32 16 32 -16 V 20 M 36 36 v 18" />
          </svg>
          <strong>Your workbench is empty</strong>
          <span>Drag a component here, or click one in the palette.</span>
        </div>
      )}
      {diagram.edges.some((e) => e.kind !== "transition") && (
        <div className="canvas-legend">
          <span className="eyebrow">CONNECTIONS</span>
          <span>
            <i className="legend-line" />
            Sync
          </span>
          <span>
            <i className="legend-line dashed" />
            Async
          </span>
          <span>
            <i className="legend-line dotted" />
            Optional
          </span>
          <span className="flow-status">
            <i className={playing ? "status-dot" : "status-dot paused"} />
            {playing ? "Flow is live" : "Flow paused"}
          </span>
        </div>
      )}
      <div className="zoom-controls panel">
        <Button
          variant="ghost"
          size="icon"
          title="Zoom out"
          aria-label="Zoom out"
          onClick={() => adjustZoom(1 / 1.2)}
        >
          <Minus />
        </Button>
        <span>{Math.round(diagram.viewport.zoom * 100)}%</span>
        <Button
          variant="ghost"
          size="icon"
          title="Zoom in"
          aria-label="Zoom in"
          onClick={() => adjustZoom(1.2)}
        >
          <Plus />
        </Button>
        <span className="toolbar-divider" />
        <Button
          variant="ghost"
          size="icon"
          title="Fit to screen"
          aria-label="Fit to screen"
          onClick={fit}
        >
          <Scan />
        </Button>
      </div>
      {/* Validation only matters for flows and state machines with something on the board. */}
      {mode !== "architecture" && diagram.nodes.length > 0 && <ValidationPanel />}
    </main>
  );
}
