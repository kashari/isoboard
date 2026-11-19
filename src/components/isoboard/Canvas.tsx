import { useCallback, useEffect, useRef, useState } from "react";
import { select } from "d3-selection";
import { zoom, zoomIdentity, zoomTransform, type ZoomBehavior } from "d3-zoom";
import {
  Minus,
  Plus,
  Scan,
  MousePointer2,
  Hand,
  Cable,
  Play,
  Pause,
  Grid2X2,
  ListOrdered,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDiagram, newId } from "@/store/diagram";
import { registry } from "@/nodes/registry";
import { GlyphAt } from "@/nodes/KidIcon";
import { project, unproject, depthSort } from "@/lib/isometric";
import {
  layoutEdges,
  grabSegment,
  setSegment,
  slideAxis,
  normalizeRoute,
  autoRoute,
  shiftRoute,
  presentableEdges,
  segmentDistance,
  frameOf,
  ICON_W,
  type EdgeLayout,
  type Route,
} from "@/lib/routing";
import { ValidationPanel } from "./ValidationPanel";
import { openDiagram } from "./file-actions";
import type { Node, NodeType } from "@/types/diagram";

// The grid never changes, so build it once as a single path. It spans ±GRID cells on both
// axes, so the squares stay squares however far you pan.
const GRID = 120;
const GRID_PATH = Array.from({ length: GRID * 2 + 1 }, (_, k) => k - GRID)
  .map((i) => {
    const a = project(i, -GRID),
      b = project(i, GRID),
      c = project(-GRID, i),
      d = project(GRID, i);
    return `M ${a.x} ${a.y} L ${b.x} ${b.y} M ${c.x} ${c.y} L ${d.x} ${d.y}`;
  })
  .join(" ");
// Grid lines stay one screen pixel wide at any zoom (and in exports), so they never blur
// into a moiré when zoomed out.
const gridWidth = (zoom: number) => String(1 / zoom);
const transformAttr = (v: { x: number; y: number; zoom: number }) =>
  `translate(${v.x} ${v.y}) scale(${v.zoom})`;
const DASH: Record<string, string | undefined> = { dashed: "9 7", dotted: "0.1 7.5" };
// A chunky storybook arrowhead pointing along +x, tip at the origin.
const HEAD_PATH = "M 1.5 0 L -12 -7.5 Q -8.5 0 -12 7.5 Z";
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface DragState {
  id: string;
  x: number;
  y: number;
  positions: Node[];
  moved: boolean;
}
/** Dragging one segment of a connector sideways. */
interface SegmentDrag {
  id: string;
  route: Route;
  j: number;
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
    presentation,
  } = useDiagram();
  const presenting = presentation !== null;
  const svgRef = useRef<SVGSVGElement>(null);
  const gridRef = useRef<SVGPathElement>(null);
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
  const [segDrag, setSegDrag] = useState<SegmentDrag | null>(null);
  const segDragRef = useRef(segDrag);
  segDragRef.current = segDrag;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const flowRef = useRef<SVGGElement>(null);
  const sceneRef = useRef<SVGGElement>(null);
  const flight = useRef(0);
  const introUntil = useRef(0);
  // During pan/zoom the live transform lives in `viewport` and is written straight to the DOM;
  // the store only receives it when the gesture ends. Adopt the store value whenever it changes
  // from outside (project switch, undo/redo).
  const storeViewport = useRef(diagram.viewport);
  if (storeViewport.current !== diagram.viewport) {
    storeViewport.current = diagram.viewport;
    viewport.current = diagram.viewport;
  }
  const applyView = useCallback((v: { x: number; y: number; zoom: number }) => {
    viewport.current = v;
    sceneRef.current?.setAttribute("transform", transformAttr(v));
    gridRef.current?.setAttribute("stroke-width", gridWidth(v.zoom));
  }, []);
  const fit = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || !zoomRef.current) return;
    const { width, height } = svg.getBoundingClientRect();
    const box = frameOf(useDiagram.getState().diagram.nodes);
    const scale = Math.max(
      0.35,
      Math.min(1.45, (width - 110) / (box.x1 - box.x0), (height - 200) / (box.y1 - box.y0)),
    );
    select(svg).call(
      zoomRef.current.transform,
      zoomIdentity
        .translate(
          width / 2 - ((box.x0 + box.x1) / 2) * scale,
          height / 2 - ((box.y0 + box.y1) / 2) * scale - 25,
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
          !useDiagram.getState().presentation &&
          (e.type === "wheel" ||
            e.type.startsWith("touch") ||
            e.button === 1 ||
            space.current ||
            toolRef.current === "pan"),
      )
      .on("zoom", (e) => applyView({ x: e.transform.x, y: e.transform.y, zoom: e.transform.k }))
      .on("end", () => {
        if (!useDiagram.getState().presentation) setViewport(viewport.current);
      });
    zoomRef.current = behavior;
    select(svg).call(behavior).on("dblclick.zoom", null);
    const v = useDiagram.getState().diagram.viewport;
    if (v.x === 0 && v.y === 0) fit();
    else select(svg).call(behavior.transform, zoomIdentity.translate(v.x, v.y).scale(v.zoom));
    return () => {
      select(svg).on(".zoom", null);
    };
  }, [diagram.id, fit, setViewport, applyView]);
  useEffect(() => {
    // Keep d3's internal transform in sync when the store viewport changes without a gesture
    // (e.g. undo restores an older viewport); otherwise the next pan would jump back.
    const svg = svgRef.current;
    const v = diagram.viewport;
    if (!svg || presenting) return;
    const t = zoomTransform(svg);
    if (t.x !== v.x || t.y !== v.y || t.k !== v.zoom) {
      select(svg).property("__zoom", zoomIdentity.translate(v.x, v.y).scale(v.zoom));
      applyView(v);
    }
  }, [diagram.viewport, presenting, applyView]);
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
  const animateDots = playing || presenting;
  useEffect(() => {
    if (!animateDots || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const animate = (t: number) => {
      flowRef.current
        ?.querySelectorAll<SVGCircleElement>("circle[data-path]")
        .forEach((circle, index) => {
          const path = svgRef.current?.querySelector<SVGPathElement>(`#${circle.dataset["path"]}`);
          if (!path) return;
          const length = path.getTotalLength();
          const p = path.getPointAtLength((t * 0.07 + index * 47) % Math.max(length, 1));
          circle.setAttribute("cx", String(p.x));
          circle.setAttribute("cy", String(p.y));
        });
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [animateDots, diagram.edges, diagram.nodes]);
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
  /** Starts sliding segment `j` of a connector (the grabbed end segments get a stop first). */
  function startSegment(e: React.PointerEvent, layout: EdgeLayout, j: number) {
    const a = nodes.find((n) => n.id === layout.edge.from),
      b = nodes.find((n) => n.id === layout.edge.to);
    if (!a || !b) return;
    const grabbed = grabSegment(a, b, layout.route, j);
    setSegDrag({ id: layout.edge.id, route: grabbed.route, j: grabbed.j, moved: false });
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }
  function move(e: React.PointerEvent<SVGSVGElement>) {
    // Only track the pointer in state while something is being dragged — setting it on every
    // move re-rendered the whole canvas just from hovering.
    if (!connecting && !drag.current && !marqueeRef.current && !segDragRef.current) return;
    const p = coordinates(e.clientX, e.clientY);
    if (connecting) setPointer(p);
    const s = segDragRef.current;
    if (s) {
      const g = unproject(p.x, p.y);
      const v = Math.round(slideAxis(s.route, s.j) === "x" ? g.gx : g.gy);
      if (v !== s.route.stops[s.j - 1])
        setSegDrag({ ...s, route: setSegment(s.route, s.j, v), moved: true });
      return;
    }
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
    if (segDrag) {
      if (segDrag.moved) {
        const { id, route } = segDrag;
        commit((d) => ({
          ...d,
          edges: d.edges.map((edge) => {
            if (edge.id !== id) return edge;
            const a = d.nodes.find((n) => n.id === edge.from),
              b = d.nodes.find((n) => n.id === edge.to);
            const { bend: _bend, route: _route, ...rest } = edge.data;
            if (!a || !b) return edge;
            const clean = normalizeRoute(a, b, route);
            // Dragged back to the default L: no custom route needed.
            const auto = autoRoute(a, b, d.nodes);
            const isAuto = !clean.stops.length && clean.start === auto.start;
            return { ...edge, data: isAuto ? rest : { ...rest, route: clean } };
          }),
        }));
      }
      setSegDrag(null);
      return;
    }
    if (drag.current && moving && drag.current.moved) {
      const first = moving[0]!,
        orig = drag.current.positions.find((n) => n.id === first.id)!;
      const dx = first.gx - orig.gx,
        dy = first.gy - orig.gy;
      const ids = new Set(moving.map((m) => m.id));
      commit((d) => ({
        ...d,
        nodes: d.nodes.map((n) => moving.find((m) => m.id === n.id) ?? n),
        // A custom route travels with the blocks when both ends move together.
        edges: d.edges.map((edge) =>
          ids.has(edge.from) && ids.has(edge.to)
            ? { ...edge, data: shiftRoute(edge.data, dx, dy) }
            : edge,
        ),
      }));
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
  function resetRoute(id: string) {
    const edge = diagram.edges.find((e) => e.id === id);
    if (!edge || (!edge.data["route"] && !edge.data["bend"])) return;
    const { bend: _bend, route: _route, ...rest } = edge.data;
    useDiagram.getState().updateEdge(id, { data: rest });
  }
  const nodes = moving
    ? diagram.nodes.map((n) => moving.find((m) => m.id === n.id) ?? n)
    : diagram.nodes;

  // ── Presentation: which connector is on stage, what is dimmed, where the camera goes ──
  const steps = presenting ? presentableEdges(diagram.nodes, diagram.edges) : [];
  const step = presentation?.step ?? 0;
  const finale = presenting && steps.length > 0 && step > steps.length;
  const current = presenting && step >= 1 && step <= steps.length ? steps[step - 1]! : null;
  // The overview (step 0) and the summary show every connector; steps reveal them in order.
  const full = finale || (presenting && step === 0);
  const shown = new Set(
    presenting ? (full ? steps : steps.slice(0, Math.max(0, step))).map((e) => e.id) : [],
  );
  const focusIds = new Set(current ? [current.from, current.to] : []);
  const seenIds = new Set(steps.slice(0, Math.max(0, step - 1)).flatMap((e) => [e.from, e.to]));
  const nodeState = (n: Node) =>
    !current
      ? ""
      : focusIds.has(n.id)
        ? "pres-focus"
        : seenIds.has(n.id)
          ? "pres-seen"
          : "pres-dim";

  const layouts = layoutEdges(nodes, diagram.edges, {
    steps: !!diagram.steps || presenting,
    override: segDrag && { id: segDrag.id, route: segDrag.route },
  }).filter((l) => !presenting || shown.has(l.edge.id));
  const edgeState = (id: string) =>
    !presenting || full || !current ? "" : id === current.id ? "pres-current" : "pres-past";

  // Fly the camera to the connector on stage (or the whole diagram), and back afterwards.
  const followKey = presenting
    ? `${step}:${presentation.follow ? (current?.id ?? "all") : "all"}`
    : "";
  const [size, setSize] = useState(0);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !presenting) return;
    const observer = new ResizeObserver(() => setSize((n) => n + 1));
    observer.observe(svg);
    return () => observer.disconnect();
  }, [presenting]);
  const lastKey = useRef("");
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    cancelAnimationFrame(flight.current);
    if (!presenting) {
      if (lastKey.current) {
        // Leaving the presentation: back to where the editor was.
        lastKey.current = "";
        const v = useDiagram.getState().diagram.viewport;
        select(svg).property("__zoom", zoomIdentity.translate(v.x, v.y).scale(v.zoom));
        applyView(v);
      }
      return;
    }
    const s = useDiagram.getState();
    const all = presentableEdges(s.diagram.nodes, s.diagram.edges);
    const st = s.presentation?.step ?? 0;
    const on = s.presentation?.follow && st >= 1 && st <= all.length ? all[st - 1] : null;
    let box = frameOf(s.diagram.nodes);
    let maxZoom = 1.8;
    if (on) {
      const ends = s.diagram.nodes.filter((n) => n.id === on.from || n.id === on.to);
      const route = layoutEdges(s.diagram.nodes, [on])[0];
      box = frameOf(ends, route?.points ?? []);
      maxZoom = 1.5;
    }
    const { width, height } = svg.getBoundingClientRect();
    // Leave room for the title (overview) or the caption (steps).
    const top = st === 0 ? 150 : 40,
      bottom = st === 0 ? 70 : 190;
    const k = Math.max(
      0.3,
      Math.min(
        maxZoom,
        (width - 100) / (box.x1 - box.x0),
        (height - top - bottom) / (box.y1 - box.y0),
      ),
    );
    const to = {
      x: width / 2 - ((box.x0 + box.x1) / 2) * k,
      y: (top + height - bottom) / 2 - ((box.y0 + box.y1) / 2) * k,
      zoom: k,
    };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const now0 = performance.now();
    const first = !lastKey.current;
    const resized = lastKey.current === followKey;
    lastKey.current = followKey;
    // Opening the presentation zooms in on the overview; a resize (e.g. entering full screen)
    // during that intro restarts it on the new frame instead of jumping.
    const intro = !reduced && (first || (resized && now0 < introUntil.current));
    if (first) introUntil.current = now0 + 600;
    const from = intro
      ? {
          zoom: to.zoom * 0.45,
          x: width / 2 - (width / 2 - to.x) * 0.45,
          y: height / 2 - (height / 2 - to.y) * 0.45,
        }
      : { ...viewport.current };
    const duration = intro ? 1500 : resized || reduced ? 0 : 900;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = duration ? Math.min(1, (now - t0) / duration) : 1;
      const e = easeInOut(t);
      // Zoom interpolates geometrically so the flight feels even.
      const zoomAt = from.zoom * Math.pow(to.zoom / from.zoom, e);
      // Keep the screen centre moving in a straight line while zooming.
      const cx = width / 2,
        cy = height / 2;
      const fromC = { x: (cx - from.x) / from.zoom, y: (cy - from.y) / from.zoom };
      const toC = { x: (cx - to.x) / to.zoom, y: (cy - to.y) / to.zoom };
      const c = { x: fromC.x + (toC.x - fromC.x) * e, y: fromC.y + (toC.y - fromC.y) * e };
      applyView({ x: cx - c.x * zoomAt, y: cy - c.y * zoomAt, zoom: zoomAt });
      if (t < 1) flight.current = requestAnimationFrame(tick);
      else select(svg).property("__zoom", zoomIdentity.translate(to.x, to.y).scale(to.zoom));
    };
    flight.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(flight.current);
  }, [presenting, followKey, size, applyView]);

  const zones = depthSort(nodes).filter((n) => n.type === "zone");
  const blocks = depthSort(nodes).filter((n) => n.type !== "zone");
  const selectedLayout = layouts.find((l) => l.edge.id === selectedEdge);
  const showTag = (l: EdgeLayout) => !presenting || full || l.edge.id === current?.id;
  const connectFrom = connecting ? nodes.find((n) => n.id === connecting) : undefined;
  return (
    <main className={`canvas-area tool-${tool} ${presenting ? "presenting" : ""}`}>
      {!presenting && (
        <div className="canvas-toolbar panel">
          <Button
            title="Select (drag a connector to re-route it)"
            aria-label="Select tool"
            variant="ghost"
            size="icon"
            className={tool === "select" ? "tool-active" : ""}
            onClick={() => setTool("select")}
          >
            <MousePointer2 />
          </Button>
          <Button
            title="Pan (or hold Space)"
            aria-label="Pan tool"
            variant="ghost"
            size="icon"
            className={tool === "pan" ? "tool-active" : ""}
            onClick={() => setTool("pan")}
          >
            <Hand />
          </Button>
          <Button
            title="Connect blocks"
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
            title={diagram.steps ? "Hide step numbers" : "Show step numbers"}
            aria-label="Toggle step numbers"
            aria-pressed={!!diagram.steps}
            variant="ghost"
            size="icon"
            className={diagram.steps ? "tool-active" : ""}
            onClick={() => useDiagram.getState().toggleSteps()}
          >
            <ListOrdered />
          </Button>
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
            aria-pressed={grid}
            variant="ghost"
            size="icon"
            onClick={() => setGrid(!grid)}
          >
            <Grid2X2 />
          </Button>
        </div>
      )}
      <svg
        ref={svgRef}
        className="diagram-canvas"
        aria-label="Isometric diagram canvas"
        onPointerMove={move}
        onPointerUp={finish}
        onPointerDown={(e) => {
          if (presenting || e.button !== 0 || space.current || tool === "pan") return;
          const p = coordinates(e.clientX, e.clientY);
          if (!e.shiftKey) selectNodes([]);
          setMarquee({ x: p.x, y: p.y, endX: p.x, endY: p.y });
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          // A dropped .isoboard / .json file opens that diagram.
          const file = e.dataTransfer.files[0];
          if (file && /\.(isoboard|json)$/i.test(file.name)) {
            void openDiagram(file);
            return;
          }
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
        <g ref={sceneRef} transform={transformAttr(viewport.current)}>
          {grid && (
            <path
              ref={gridRef}
              className="iso-grid"
              d={GRID_PATH}
              strokeWidth={gridWidth(viewport.current.zoom)}
            />
          )}
          {zones.map((n) => {
            const p = project(n.gx, n.gy, n.gz);
            return (
              <g
                key={n.id}
                className={`diagram-zone ${current ? "pres-zone" : ""}`}
                transform={`translate(${p.x} ${p.y})`}
                onPointerDown={(e) => startDrag(e, n)}
              >
                <registry.zone.component node={n} />
              </g>
            );
          })}
          {layouts.map((l) => {
            const { edge, path } = l;
            const state = edgeState(edge.id);
            const draw = state === "pres-current" && !DASH[edge.style];
            return (
              <g
                key={state === "pres-current" ? `${edge.id}-${step}` : edge.id}
                onPointerDown={(e) => {
                  if (e.button !== 0 || space.current || tool === "pan") return;
                  e.stopPropagation();
                  selectNodes([], edge.id);
                  // Grab the nearest segment: dragging it sideways re-routes the connector.
                  const p = coordinates(e.clientX, e.clientY);
                  const near = l.grips.reduce((best, g) =>
                    segmentDistance(p, g.p, g.q) < segmentDistance(p, best.p, best.q) ? g : best,
                  );
                  startSegment(e, l, near.j);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  resetRoute(edge.id);
                }}
                className={`diagram-edge edge-${edge.style} ${edge.id === selectedEdge ? "edge-selected" : ""} ${state} ${draw ? "pres-draw" : ""}`}
              >
                <path className="edge-hit" data-edge-hit={edge.id} d={path} />
                <path className="edge-casing" d={path} pathLength={draw ? 1 : undefined} />
                <path
                  id={`path-${edge.id}`}
                  className="edge-line"
                  d={path}
                  pathLength={draw ? 1 : undefined}
                  strokeDasharray={DASH[edge.style]}
                />
              </g>
            );
          })}
          <g ref={flowRef}>
            {layouts
              .filter((l) => !presenting || l.edge.id === current?.id)
              .map((l) => (
                <circle
                  key={l.edge.id}
                  data-path={`path-${l.edge.id}`}
                  className={`flow-dot flow-${l.edge.kind}`}
                  r="4.5"
                  cx={l.points[0]!.x}
                  cy={l.points[0]!.y}
                />
              ))}
          </g>
          {blocks.map((n) => {
            const p = project(n.gx, n.gy, n.gz);
            const Shape = registry[n.type].component;
            const selected = !presenting && selection.includes(n.id);
            return (
              <g
                key={n.id}
                aria-label={`Node ${n.label}`}
                role="graphics-symbol"
                className={`diagram-node ${selected ? "selected" : ""} ${presenting ? nodeState(n) : ""}`}
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
                {focusIds.has(n.id) && <ellipse className="pres-ring" cy="4" rx="74" ry="37" />}
                <Shape node={n} />
                {!presenting && (
                  <>
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
                  </>
                )}
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
          {/* Arrowheads, tags and grips sit above the blocks, so they're never hidden. */}
          <g className="edge-overlay">
            {layouts.map((l) => {
              const state = edgeState(l.edge.id);
              const cls = `edge-head ${l.edge.id === selectedEdge ? "edge-head-selected" : ""} ${state}`;
              return (
                <g
                  key={state === "pres-current" ? `${l.edge.id}-${step}` : l.edge.id}
                  className={cls}
                >
                  <path
                    d={HEAD_PATH}
                    transform={`translate(${l.head.x} ${l.head.y}) rotate(${l.head.angle})`}
                  />
                  {l.tail && (
                    <path
                      d={HEAD_PATH}
                      transform={`translate(${l.tail.x} ${l.tail.y}) rotate(${l.tail.angle})`}
                    />
                  )}
                </g>
              );
            })}
            {layouts.filter(showTag).map((l) => {
              const { edge } = l;
              const { x, y, text, guard, badgeW, textW, icon } = l.tag;
              // In a presentation the number shows on the connector on stage.
              const badge = presenting && !diagram.steps && !current ? "" : l.tag.badge;
              const bw = badge ? badgeW : 0;
              const selected = edge.id === selectedEdge;
              // With a number, the text pill tucks under the number's right cap: one shape.
              const tuck = badge && (text || icon) ? 10 : 0;
              const chipX = bw - tuck;
              const total = bw + textW;
              if (!total && !guard) return null;
              const x0 = x - total / 2 - (guard && total ? 11 : 0);
              return (
                <g
                  key={edgeState(edge.id) === "pres-current" ? `${edge.id}-${step}` : edge.id}
                  className={`edge-tag ${selected ? "edge-tag-selected" : ""} edge-tag-${edge.style} ${edgeState(edge.id)}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    selectNodes([], edge.id);
                  }}
                >
                  {guard && (
                    <path
                      className="guard-pip"
                      transform={`translate(${total ? x0 + total + 11 : x} ${y})`}
                      d="M 0 -8 L 8 0 L 0 8 L -8 0 Z"
                    >
                      <title>{`[${guard}]`}</title>
                    </path>
                  )}
                  {total > 0 && (
                    <g transform={`translate(${x0} ${y - 10})`}>
                      <rect className="edge-tag-shadow" y="2.5" width={total} height="20" rx="10" />
                      {(text || icon) && (
                        <>
                          <rect
                            className="edge-chip"
                            x={chipX}
                            width={textW + tuck}
                            height="20"
                            rx="10"
                          />
                          {icon && (
                            <GlyphAt
                              name={icon}
                              x={chipX + tuck + (text ? 12 : 11)}
                              y={10}
                              size={15}
                            />
                          )}
                          {text && (
                            <text
                              className="edge-label"
                              x={
                                chipX +
                                tuck +
                                (icon ? ICON_W : 0) +
                                (textW - (icon ? ICON_W : 0)) / 2
                              }
                              y="13.6"
                              textAnchor="middle"
                            >
                              {text}
                            </text>
                          )}
                        </>
                      )}
                      {badge && (
                        <>
                          <rect className="edge-step" width={bw} height="20" rx="10" />
                          <text className="edge-step-label" x={bw / 2} y="13.6" textAnchor="middle">
                            {badge}
                          </text>
                        </>
                      )}
                    </g>
                  )}
                </g>
              );
            })}
            {!presenting &&
              selectedLayout?.grips.map((g) => {
                // Each grip slides its segment sideways (across the segment's own axis).
                const angle = g.axis === "x" ? 26.57 : -26.57;
                return (
                  <g
                    key={`${g.j}-${g.x}-${g.y}`}
                    className={`segment-grip grip-${g.axis}`}
                    transform={`translate(${g.x} ${g.y}) rotate(${angle})`}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      startSegment(e, selectedLayout, g.j);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      resetRoute(selectedLayout.edge.id);
                    }}
                  >
                    <title>Drag to move this segment · double-click to reset the route</title>
                    <rect className="grip-hit" x="-20" y="-12" width="40" height="24" rx="12" />
                    <rect x="-11" y="-4.5" width="22" height="9" rx="4.5" />
                  </g>
                );
              })}
          </g>
          {connectFrom && (
            <path
              className="connecting-line"
              d={`M ${project(connectFrom.gx, connectFrom.gy).x} ${project(connectFrom.gx, connectFrom.gy).y} L ${pointer.x} ${pointer.y}`}
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
      {diagram.nodes.length === 0 && !presenting && (
        <div className="canvas-empty">
          <svg viewBox="0 0 72 60" aria-hidden="true">
            <path d="M 36 4 L 68 20 L 36 36 L 4 20 Z M 4 20 v 18 l 32 16 32 -16 V 20 M 36 36 v 18" />
          </svg>
          <strong>Your workbench is empty</strong>
          <span>Drag a component here, or click one in the palette.</span>
        </div>
      )}
      {!presenting && (
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
      )}
      {/* Validation only matters for flows and state machines with something on the board. */}
      {!presenting && mode !== "architecture" && diagram.nodes.length > 0 && <ValidationPanel />}
    </main>
  );
}
