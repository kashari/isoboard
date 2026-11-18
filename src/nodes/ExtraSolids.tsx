import type { ReactElement } from "react";
import type { Node, NodeType } from "@/types/diagram";
import { FaceIcon } from "./KidIcon";

/**
 * Additional node shapes, built from a tiny isometric "prism" helper so each item is a few
 * lines of geometry. Coordinates are in grid units (x along gx, y along gy) plus z in px,
 * matching `project()` in lib/isometric: screen = ((x - y) * 32, (x + y) * 16 - z).
 */
const U = 32;
const pt = (x: number, y: number, z = 0) => `${(x - y) * U} ${(x + y) * (U / 2) - z}`;

interface Box {
  x?: number;
  y?: number;
  z?: number;
  w: number;
  d: number;
  h: number;
}
/** Visible faces of a box centred on (x, y), footprint w × d grid units, height h px. */
function prism({ x = 0, y = 0, z = 0, w, d, h }: Box) {
  const [x0, x1, y0, y1] = [x - w / 2, x + w / 2, y - d / 2, y + d / 2];
  return {
    top: `M ${pt(x0, y0, z + h)} L ${pt(x1, y0, z + h)} L ${pt(x1, y1, z + h)} L ${pt(x0, y1, z + h)} Z`,
    left: `M ${pt(x0, y1, z + h)} L ${pt(x1, y1, z + h)} L ${pt(x1, y1, z)} L ${pt(x0, y1, z)} Z`,
    right: `M ${pt(x1, y0, z + h)} L ${pt(x1, y1, z + h)} L ${pt(x1, y1, z)} L ${pt(x1, y0, z)} Z`,
  };
}
function Prism(props: Box & { topClass?: string }) {
  const f = prism(props);
  return (
    <>
      <path className="face-left" d={f.left} />
      <path className="face-right" d={f.right} />
      <path className={props.topClass ?? "face-top"} d={f.top} />
    </>
  );
}
/** Low base slab most items stand on. */
const Slab = ({ s = 1.3 }: { s?: number }) => <Prism w={s} d={s} h={7} topClass="face-base" />;

/** Cartoon highlight along the upper-left edge of a top face centred at (cx, cy). */
export function Glint({ cx, cy, hw, hh }: { cx: number; cy: number; hw: number; hh: number }) {
  return (
    <g className="glint" transform={`translate(${cx} ${cy})`}>
      <path d={`M ${-0.6 * hw} ${-0.12 * hh} L ${-0.36 * hw} ${-0.36 * hh}`} />
      <circle cx={-0.24 * hw} cy={-0.48 * hh} r="1.4" />
    </g>
  );
}

function Mobile() {
  return (
    <>
      <Slab s={1.1} />
      <path className="face-right" d="M 12 -14 L 17 -11.5 L 17 -61.5 L 12 -64 Z" />
      <path className="face-left" d="M -16 -50 L 12 -64 L 17 -61.5 L -11 -47.5 Z" />
      <path className="face-top" d="M -16 0 L 12 -14 L 12 -64 L -16 -50 Z" />
      <path className="screen" d="M -12.5 -5 L 8.5 -15.5 L 8.5 -55 L -12.5 -44.5 Z" />
      <path className="shape-line" d="M -6 -47 L 2 -51" />
      <circle className="ink-dot-solid" cx="-2" cy="-6.5" r="1.8" />
    </>
  );
}

function Sphere({ withBase }: { withBase: boolean }) {
  return (
    <>
      {withBase && <Slab s={1.1} />}
      <circle className="face-top" cy="-26" r="29" />
      <path
        className="face-right shade"
        d="M 6 -54.4 A 29 29 0 0 1 6 2.4 A 22 29 0 0 0 6 -54.4 Z"
      />
      {withBase ? (
        <>
          <ellipse className="shape-line" cy="-26" rx="29" ry="9" />
          <ellipse className="shape-line" cy="-26" rx="11" ry="29" />
        </>
      ) : null}
      <path className="glint" d="M -19 -32 Q -17 -44 -7 -48" />
      <circle className="glint-dot" cx="-20" cy="-24" r="1.6" />
    </>
  );
}

function Firewall() {
  const wall = { w: 2.4, d: 0.42, h: 36 };
  const f = prism(wall);
  // Mortar lines on the long front face (the one spanning x at y = +d/2).
  const y = wall.d / 2;
  const rows = [9, 18, 27];
  const joints: string[] = [];
  [0, 9, 18, 27].forEach((z, r) => {
    const offset = r % 2 ? 0.3 : 0;
    for (let x = -1.2 + 0.6 + offset; x < 1.2; x += 0.6)
      joints.push(`M ${pt(x, y, z)} L ${pt(x, y, z + 9)}`);
  });
  return (
    <>
      <Slab s={1.4} />
      <path className="face-left brick" d={f.left} />
      <path className="face-right" d={f.right} />
      <path className="face-top" d={f.top} />
      <path
        className="shape-line"
        d={
          rows.map((z) => `M ${pt(-1.2, y, z)} L ${pt(1.2, y, z)}`).join(" ") +
          " " +
          joints.join(" ")
        }
      />
      <path
        className="flame"
        d="M 30 -50 C 22 -60 30 -66 28 -76 C 38 -70 44 -60 38 -50 C 36 -46 32 -46 30 -50 Z"
      />
    </>
  );
}

function Gateway({ node }: { node: Node }) {
  return (
    <>
      <Slab s={1.5} />
      <Prism x={-0.55} w={0.36} d={0.5} h={40} z={7} />
      <Prism x={0.55} w={0.36} d={0.5} h={40} z={7} />
      <Prism w={1.6} d={0.62} h={12} z={47} />
      <FaceIcon name={node.icon} cx={0} cy={-62} scale={1.8} />
    </>
  );
}

function Padlock() {
  return (
    <>
      <Slab s={1.15} />
      <path className="shackle-outline" d="M -14 -36 L -14 -50 C -14 -70 14 -70 14 -50 L 14 -36" />
      <path className="shackle" d="M -14 -36 L -14 -50 C -14 -70 14 -70 14 -50 L 14 -36" />
      <Prism w={0.9} d={0.45} h={34} z={7} />
      <circle className="ink-dot-solid" cx="-8" cy="-22" r="3.4" />
      <path className="ink-dot-solid" d="M -9.6 -21 L -6.4 -21 L -6.8 -13 L -9.2 -13 Z" />
    </>
  );
}

function Analytics() {
  return (
    <>
      <Slab s={1.5} />
      <Prism x={-0.42} y={0.1} w={0.34} d={0.34} h={20} z={7} />
      <Prism x={0} y={0.1} w={0.34} d={0.34} h={34} z={7} topClass="face-top accent-top" />
      <Prism x={0.42} y={0.1} w={0.34} d={0.34} h={50} z={7} />
      <path className="trend" d="M -30 -40 L -6 -54 L 8 -50 L 30 -74" />
      <path className="trend-head" d="M 22 -74 L 31 -75 L 29 -66" />
    </>
  );
}

function Mail() {
  const env = { w: 1.5, d: 0.22, h: 34, z: 7 };
  const y = env.d / 2;
  return (
    <>
      <Slab s={1.3} />
      <Prism {...env} topClass="face-top" />
      <path className="envelope" d={prism(env).left} />
      <path
        className="shape-line"
        d={`M ${pt(-0.75, y, 41)} L ${pt(0, y, 22)} L ${pt(0.75, y, 41)} M ${pt(-0.75, y, 7)} L ${pt(-0.15, y, 26)} M ${pt(0.75, y, 7)} L ${pt(0.15, y, 26)}`}
      />
      <circle className="badge-dot" cx="30" cy="-58" r="9" />
      <text className="badge-dot-text" x="30" y="-54.5" textAnchor="middle">
        1
      </text>
    </>
  );
}

function Pyramid() {
  const apex = pt(0, 0, 62);
  const [a, b, c] = [pt(-0.75, 0.75), pt(0.75, 0.75), pt(0.75, -0.75)];
  return (
    <>
      <path className="face-left" d={`M ${a} L ${b} L ${apex} Z`} />
      <path className="face-right" d={`M ${b} L ${c} L ${apex} Z`} />
      <path className="glint" d={`M ${pt(-0.42, 0.52, 22)} L ${pt(-0.18, 0.24, 44)}`} />
    </>
  );
}

function Cone() {
  return (
    <>
      <path className="face-top" d="M -34 8 A 34 17 0 0 0 34 8 L 0 -60 Z" />
      <path className="face-right shade" d="M 0 -60 L 34 8 A 34 17 0 0 1 12 24 Z" />
      <path className="glint" d="M -18 -6 L -7 -34" />
    </>
  );
}

/* ---------- State-machine pseudostates & helpers ---------- */

const SHIELD =
  "M 0 -70 C 9 -64 18 -64 22 -66 L 22 -40 C 22 -24 12 -14 0 -8 C -12 -14 -22 -24 -22 -40 L -22 -66 C -18 -64 -9 -64 0 -70 Z";

/** Choice pseudostate: a cut gem that branches on guards. */
function Choice() {
  return (
    <>
      <path className="face-left" d="M -30 -22 L 0 -7 L 0 20 Z" />
      <path className="face-right" d="M 0 -7 L 30 -22 L 0 20 Z" />
      <path className="face-top" d="M 0 -38 L 30 -22 L 0 -7 L -30 -22 Z" />
      <path className="shape-line" d="M -15 -22 L 0 -14.5 L 15 -22" />
      <Glint cx={0} cy={-23} hw={30} hh={15} />
    </>
  );
}

/** Junction pseudostate: a small glossy ink ball. */
function Junction() {
  return (
    <>
      <Slab s={0.75} />
      <circle className="ink-ball" cy="-14" r="13" />
      <circle className="glint-dot" cx="-5" cy="-19" r="3" />
    </>
  );
}

/** Fork / join: the classic thick synchronisation bar. */
function ForkBar() {
  const bar = prism({ w: 2.3, d: 0.34, h: 12 });
  return (
    <>
      <path className="bar-side" d={bar.left} />
      <path className="bar-side bar-dark" d={bar.right} />
      <path className="bar-top" d={bar.top} />
      <path className="glint" d={`M ${pt(-0.95, 0, 12)} L ${pt(-0.4, 0, 12)}`} />
    </>
  );
}

/** A round puck with an upright paper sticker carrying a short mark (H, H*). */
function MarkedPuck({ mark }: { mark: string }) {
  return (
    <>
      <path className="face-left" d="M -32 -10 L -32 2 A 32 16 0 0 0 32 2 L 32 -10 Z" />
      <ellipse className="face-top" cy="-10" rx="32" ry="16" />
      <Glint cx={0} cy={-10} hw={32} hh={16} />
      <g transform="translate(0 -26)">
        <circle className="drop" cx="1.6" cy="2" r="14" />
        <circle className="paper" r="14" />
        <text className="mark-text" y="5.5" textAnchor="middle">
          {mark}
        </text>
      </g>
    </>
  );
}

/** Entry / exit point: a small ring puck with the node's icon sticker. */
function PointPuck({ node }: { node: Node }) {
  return (
    <>
      <path className="face-left" d="M -26 -6 L -26 2 A 26 13 0 0 0 26 2 L 26 -6 Z" />
      <ellipse className="face-top" cy="-6" rx="26" ry="13" />
      <ellipse className="paper" cy="-6" rx="14" ry="7" />
      <FaceIcon name={node.icon} cx={0} cy={-14} scale={1.7} />
    </>
  );
}

/** Terminate pseudostate: a chunky outlined X. */
function Terminate() {
  const x = "M -16 -46 L 16 -14 M 16 -46 L -16 -14";
  return (
    <>
      <Slab s={1} />
      <path className="x-outline" d={x} />
      <path className="x-fill" d={x} />
    </>
  );
}

/** Composite state: a state with a nested state sitting on top of it. */
function Composite({ node }: { node: Node }) {
  return (
    <>
      <Prism w={2} d={1.5} h={12} />
      <Prism x={-0.15} y={-0.1} w={1.1} d={0.75} h={10} z={12} topClass="face-top inner-top" />
      <Glint cx={-2} cy={-26} hw={30} hh={15} />
      <FaceIcon name={node.icon} cx={-2} cy={-24} scale={1.5} />
    </>
  );
}

/** Guard: a shield with a check mark — a condition that must hold to pass. */
function Guard() {
  const check = "M -9 -38 L -2 -30 L 11 -48";
  return (
    <>
      <Slab s={1.05} />
      <path className="face-right" d={SHIELD} transform="translate(5 2.5)" />
      <path className="face-top" d={SHIELD} />
      <path className="glint" d="M -16 -60 L -16 -46" />
      <path className="x-outline check-outline" d={check} />
      <path className="check" d={check} />
    </>
  );
}

/** Shape renderers for the extra node types; NodeSolid falls back to its built-ins. */
export const extraSolids: Partial<Record<NodeType, (node: Node) => ReactElement>> = {
  mobile: () => <Mobile />,
  cdn: () => <Sphere withBase />,
  firewall: () => <Firewall />,
  gateway: (node) => <Gateway node={node} />,
  auth: () => <Padlock />,
  analytics: () => <Analytics />,
  mail: () => <Mail />,
  pyramid: () => <Pyramid />,
  sphere: () => <Sphere withBase={false} />,
  cone: () => <Cone />,
  choice: () => <Choice />,
  junction: () => <Junction />,
  fork: () => <ForkBar />,
  history: (node) => (
    <MarkedPuck
      mark={
        String(node.data["depth"] ?? "")
          .trim()
          .toLowerCase()
          .startsWith("deep")
          ? "H*"
          : "H"
      }
    />
  ),
  entry: (node) => <PointPuck node={node} />,
  exit: (node) => <PointPuck node={node} />,
  terminate: () => <Terminate />,
  composite: (node) => <Composite node={node} />,
  guard: () => <Guard />,
};
