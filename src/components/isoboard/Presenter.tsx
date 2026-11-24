import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Highlighter,
  MousePointer2,
  Crosshair,
  Focus,
  Eraser,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDiagram } from "@/store/diagram";
import { presentationSteps } from "@/lib/routing";
import { branchTone, edgeText } from "@/lib/logic";
import { NodeIcon } from "@/nodes/NodeSolid";

type Tool = "pointer" | "laser" | "ink";
type Pt = { x: number; y: number; t: number };
interface Stroke {
  id: number;
  points: Pt[];
  /** When the pen lifted; the ink fades away after that. */
  done: number | null;
}
const INK_HOLD = 1600;
const INK_FADE = 900;
const LASER_TRAIL = 260;
const HUD_IDLE = 2600;

const strokePath = (pts: Pt[]) =>
  pts.length === 1
    ? `M ${pts[0]!.x} ${pts[0]!.y} l 0.1 0`
    : pts.reduce((d, p, i) => {
        if (i === 0) return `M ${p.x} ${p.y}`;
        // Smooth through midpoints so fast strokes don't look jagged.
        const prev = pts[i - 1]!;
        return d + ` Q ${prev.x} ${prev.y} ${(prev.x + p.x) / 2} ${(prev.y + p.y) / 2}`;
      }, "") + ` L ${pts.at(-1)!.x} ${pts.at(-1)!.y}`;

/**
 * Presentation mode: full-screen, chrome-free, walking through the connectors in step order.
 * Step 0 is the overview, steps 1…n put one connector on stage (the camera follows it in
 * Canvas); a condition's branches share one step and show together. The last step shows the
 * full picture. Presenter tools: a laser pointer and
 * disappearing ink. Controls hide themselves when the mouse rests.
 */
export function Presenter() {
  const diagram = useDiagram((s) => s.diagram);
  const presentation = useDiagram((s) => s.presentation)!;
  const steps = presentationSteps(diagram.nodes, diagram.edges);
  const last = steps.length ? steps.length + 1 : 0;
  const step = Math.min(presentation.step, last);
  const [tool, setTool] = useState<Tool>("pointer");
  const [hud, setHud] = useState(true);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [laser, setLaser] = useState<Pt[]>([]);
  const [, setFrame] = useState(0);
  const drawing = useRef<number | null>(null);
  const press = useRef<{ x: number; y: number } | null>(null);
  const idle = useRef(0);
  const hovering = useRef(false);
  const root = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (n: number) => useDiagram.getState().setPresentation({ step: Math.max(0, Math.min(last, n)) }),
    [last],
  );
  const exit = useCallback(() => useDiagram.getState().stopPresenting(), []);
  const wake = useCallback(() => {
    setHud(true);
    clearTimeout(idle.current);
    idle.current = window.setTimeout(() => {
      if (!hovering.current) setHud(false);
    }, HUD_IDLE);
  }, []);

  // Full screen while presenting; leaving full screen (Esc) ends the presentation. If the
  // editor was already full screen, it stays that way afterwards.
  useEffect(() => {
    const wasFull = !!document.fullscreenElement;
    let entered = wasFull;
    const change = () => {
      if (document.fullscreenElement) entered = true;
      else if (entered) useDiagram.getState().stopPresenting();
    };
    document.addEventListener("fullscreenchange", change);
    if (!wasFull)
      document.documentElement.requestFullscreen?.().catch(() => {
        /* not allowed (e.g. iframe): present in the window */
      });
    wake();
    return () => {
      document.removeEventListener("fullscreenchange", change);
      clearTimeout(idle.current);
      if (!wasFull && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [wake]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter", "n"].includes(k)) go(step + 1);
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "p"].includes(k)) go(step - 1);
      else if (k === "Home") go(0);
      else if (k === "End") go(last);
      else if (k === "Escape") exit();
      else if (k === "l" || k === "L") setTool((t) => (t === "laser" ? "pointer" : "laser"));
      else if (k === "d" || k === "D") setTool((t) => (t === "ink" ? "pointer" : "ink"));
      else if (k === "c" || k === "C") setStrokes([]);
      else if (k === "f" || k === "F")
        useDiagram.getState().setPresentation({ follow: !presentation.follow });
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [go, exit, step, last, presentation.follow]);

  // Ink and laser fade over time: animate only while something is on screen.
  const live = strokes.length > 0 || laser.length > 0;
  useEffect(() => {
    if (!live) return;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      setStrokes((list) => {
        const next = list.filter((s) => s.done === null || now - s.done < INK_HOLD + INK_FADE);
        return next.length === list.length ? list : next;
      });
      setLaser((pts) => {
        const next = pts.filter((p, i) => i === pts.length - 1 || now - p.t < LASER_TRAIL);
        return next.length === pts.length ? pts : next;
      });
      setFrame((f) => f + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live]);

  const local = (e: React.PointerEvent) => {
    const r = root.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() };
  };
  const now = performance.now();
  const group = step >= 1 && step <= steps.length ? steps[step - 1]! : null;
  const edge = group?.length === 1 ? group[0]! : null;
  const branches = group && group.length > 1 ? group : null;
  const source = group && diagram.nodes.find((n) => n.id === group[0]!.from);
  const name = (id: string) => diagram.nodes.find((n) => n.id === id)?.label || "Untitled";
  const note = edge ? String(edge.data["note"] ?? "").trim() : "";
  const label = edge ? edgeText(edge).trim() : "";
  const icon = edge ? String(edge.data["icon"] ?? "") : "";

  return (
    <div
      ref={root}
      className={`presenter pres-tool-${tool} ${hud ? "" : "hud-hidden"}`}
      role="application"
      aria-label="Presentation"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        wake();
        const p = local(e);
        press.current = p;
        if (tool === "ink") {
          const id = p.t;
          drawing.current = id;
          setStrokes((list) => [...list, { id, points: [p], done: null }]);
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      }}
      onPointerMove={(e) => {
        wake();
        const p = local(e);
        if (tool === "laser") setLaser((pts) => [...pts.slice(-40), p]);
        if (tool === "ink" && drawing.current !== null) {
          const id = drawing.current;
          setStrokes((list) =>
            list.map((s) => (s.id === id ? { ...s, points: [...s.points, p] } : s)),
          );
        }
      }}
      onPointerUp={(e) => {
        const p = local(e);
        if (drawing.current !== null) {
          const id = drawing.current;
          drawing.current = null;
          setStrokes((list) => list.map((s) => (s.id === id ? { ...s, done: p.t } : s)));
        } else if (
          tool === "pointer" &&
          press.current &&
          Math.hypot(p.x - press.current.x, p.y - press.current.y) < 6
        )
          go(step + 1);
        press.current = null;
      }}
      onPointerLeave={() => setLaser([])}
      onContextMenu={(e) => {
        e.preventDefault();
        go(step - 1);
      }}
    >
      {last > 0 && (
        <div className="pres-progress" aria-hidden="true">
          <i style={{ width: `${(step / last) * 100}%` }} />
        </div>
      )}

      {step === 0 && (
        <div className="pres-title">
          <span className="pres-kicker">Isoboard presentation</span>
          <h1>{diagram.name}</h1>
          <p>
            {steps.length
              ? `${steps.length} step${steps.length > 1 ? "s" : ""} · press Space or click to begin`
              : "No connections to step through — here is the whole picture."}
          </p>
        </div>
      )}

      <svg className="pres-ink" aria-hidden="true">
        <defs>
          <filter id="pres-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {strokes.map((s) => {
          const age = s.done === null ? 0 : now - s.done - INK_HOLD;
          const opacity = age <= 0 ? 1 : Math.max(0, 1 - age / INK_FADE);
          return (
            <path
              key={s.id}
              className="ink-stroke"
              d={strokePath(s.points)}
              opacity={opacity}
              filter="url(#pres-glow)"
            />
          );
        })}
        {tool === "laser" && laser.length > 0 && (
          <g filter="url(#pres-glow)">
            {laser.slice(0, -1).map((p, i) => {
              const k = 1 - (now - p.t) / LASER_TRAIL;
              return k > 0 ? (
                <circle
                  key={p.t}
                  className="laser-trail"
                  cx={p.x}
                  cy={p.y}
                  r={2 + 4 * k}
                  opacity={k * 0.55 * (i / laser.length)}
                />
              ) : null;
            })}
            <circle className="laser-dot" cx={laser.at(-1)!.x} cy={laser.at(-1)!.y} r="7" />
          </g>
        )}
      </svg>

      {step > 0 && (
        <div key={step} className="pres-caption" aria-live="polite">
          {branches ? (
            <>
              <span className="pres-badge">{step}</span>
              <div>
                <div className="pres-route">
                  <strong>{name(branches[0]!.from)}</strong>
                </div>
                <ul className="pres-branches">
                  {branches.map((b) => {
                    const text = edgeText(b).trim();
                    const tone = branchTone(b, source ?? undefined);
                    return (
                      <li key={b.id}>
                        {text && (
                          <span className={`pres-label ${tone ? `pres-label-${tone}` : ""}`}>
                            {text}
                          </span>
                        )}
                        <ArrowRight className="pres-arrow" size={16} strokeWidth={2.6} />
                        <strong>{name(b.to)}</strong>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          ) : edge ? (
            <>
              <span className="pres-badge">{step}</span>
              <div>
                <div className="pres-route">
                  <strong>{name(edge.from)}</strong>
                  <ArrowRight className="pres-arrow" size={18} strokeWidth={2.6} />
                  <strong>{name(edge.to)}</strong>
                </div>
                {(label || icon || note) && (
                  <div className="pres-text">
                    {(label || icon) && (
                      <span className="pres-label">
                        {icon && <NodeIcon name={icon} size={15} />}
                        {label}
                      </span>
                    )}
                    {note && <span>{note}</span>}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div>
              <div className="pres-route">
                <strong>The full picture</strong>
              </div>
              <div className="pres-text">
                {diagram.nodes.filter((n) => n.type !== "zone").length} blocks · {steps.length}{" "}
                connections
              </div>
            </div>
          )}
        </div>
      )}

      <div
        className="pres-hud"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onPointerEnter={() => {
          hovering.current = true;
          setHud(true);
        }}
        onPointerLeave={() => {
          hovering.current = false;
          wake();
        }}
      >
        <Button
          variant="ghost"
          size="icon"
          title="Previous (←)"
          aria-label="Previous step"
          disabled={step <= 0}
          onClick={() => go(step - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="pres-count">
          {step === 0 ? "Overview" : step > steps.length ? "Summary" : `${step} / ${steps.length}`}
        </span>
        <Button
          variant="ghost"
          size="icon"
          title="Next (→ or Space)"
          aria-label="Next step"
          disabled={step >= last}
          onClick={() => go(step + 1)}
        >
          <ChevronRight />
        </Button>
        <span className="toolbar-divider" />
        <Button
          variant="ghost"
          size="icon"
          title="Click to advance"
          aria-label="Pointer"
          aria-pressed={tool === "pointer"}
          className={tool === "pointer" ? "tool-active" : ""}
          onClick={() => setTool("pointer")}
        >
          <MousePointer2 />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Laser pointer (L)"
          aria-label="Laser pointer"
          aria-pressed={tool === "laser"}
          className={tool === "laser" ? "tool-active" : ""}
          onClick={() => setTool("laser")}
        >
          <Crosshair />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Disappearing ink (D) · C clears"
          aria-label="Disappearing ink"
          aria-pressed={tool === "ink"}
          className={tool === "ink" ? "tool-active" : ""}
          onClick={() => setTool("ink")}
        >
          <Highlighter />
        </Button>
        {strokes.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            title="Clear ink (C)"
            aria-label="Clear ink"
            onClick={() => setStrokes([])}
          >
            <Eraser />
          </Button>
        )}
        <span className="toolbar-divider" />
        <Button
          variant="ghost"
          size="icon"
          title="Camera follows each step (F)"
          aria-label="Follow camera"
          aria-pressed={presentation.follow}
          className={presentation.follow ? "tool-active" : ""}
          onClick={() => useDiagram.getState().setPresentation({ follow: !presentation.follow })}
        >
          <Focus />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Exit (Esc)"
          aria-label="Exit presentation"
          onClick={exit}
        >
          <X />
        </Button>
      </div>
    </div>
  );
}
