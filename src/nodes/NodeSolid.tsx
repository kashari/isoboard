import type { Node, NodeType } from "@/types/diagram";
import { FaceIcon, UserFigure } from "./KidIcon";
import { extraSolids, Glint } from "./ExtraSolids";
export { NodeIcon } from "./KidIcon";
export interface SolidProps {
  node: Node;
  preview?: boolean;
}
/** Tech-stack blocks reuse a base shape; their sticker icon tells them apart. */
const SHAPE_OF: Partial<Record<NodeType, NodeType>> = {
  springboot: "service",
  kubernetes: "service",
  postgres: "database",
  oracle: "database",
  mysql: "database",
  mongodb: "database",
  elastic: "database",
  redis: "cache",
  kafka: "queue",
  rabbitmq: "queue",
  nginx: "balancer",
  docker: "box",
  "file-pdf": "file",
  "file-csv": "file",
  "file-json": "file",
  "file-xml": "file",
  "file-xlsx": "file",
  "file-docx": "file",
  "file-zip": "file",
  "file-img": "file",
  "file-video": "file",
  "file-txt": "file",
  "file-yaml": "file",
  "file-log": "file",
};
export function NodeSolid({ node, preview = false }: SolidProps) {
  const { color } = node;
  const type = SHAPE_OF[node.type] ?? node.type;
  const height = type === "cache" ? 23 : type === "balancer" ? 22 : 42;
  const tall = type === "box" || type === "storage" || type === "function" || type === "ai";
  return (
    <g className={`solid color-${color}`}>
      {type !== "zone" && type !== "note" && type !== "file" && (
        <path className="ground-shadow" d="M 10 -12 L 60 13 L 10 38 L -40 13 Z" />
      )}
      <g>
        {extraSolids[type] ? (
          extraSolids[type](node)
        ) : type === "zone" ? (
          <>
            <path
              className="zone-face"
              d={`M 0 -32 L ${Number(node.data["width"] ?? 6) * 32} ${Number(node.data["width"] ?? 6) * 16 - 32} L ${(Number(node.data["width"] ?? 6) - Number(node.data["height"] ?? 4)) * 32} ${(Number(node.data["width"] ?? 6) + Number(node.data["height"] ?? 4)) * 16 - 32} L ${-Number(node.data["height"] ?? 4) * 32} ${Number(node.data["height"] ?? 4) * 16 - 32} Z`}
            />
            <text x="8" y="-13" className="zone-label">
              {node.label}
            </text>
          </>
        ) : type === "database" || type === "cache" ? (
          <>
            <path
              className="face-left"
              d={`M -43 -${height} L -43 0 C -43 27 43 27 43 0 L 43 -${height} Z`}
            />
            <path className="cylinder-line" d="M -43 -5 C -43 22 43 22 43 -5" />
            <ellipse className="face-top" cx="0" cy={-height} rx="43" ry="21" />
            <Glint cx={0} cy={-height} hw={43} hh={21} />
            <FaceIcon name={node.icon} cx={0} cy={-height} scale={2.5} />
          </>
        ) : type === "service" || type === "balancer" ? (
          <>
            <path
              className="face-left"
              d={`M -46 -${height} L 0 ${23 - height} L 0 23 L -46 0 Z`}
            />
            <path className="face-right" d={`M 0 ${23 - height} L 46 -${height} L 46 0 L 0 23 Z`} />
            <path
              className="face-top"
              d={`M -46 -${height} L -23 -${height + 20} L 23 -${height + 20} L 46 -${height} L 23 -${height - 20} L -23 -${height - 20} Z`}
            />
            <Glint cx={0} cy={-height} hw={46} hh={20} />
            <path className="server-mark" d="M -33 -9 l 8 4 M -33 -16 l 8 4 M 17 5 l 15 -7" />
            <FaceIcon name={node.icon} cx={0} cy={-height} scale={2.2} />
          </>
        ) : type === "user" ? (
          <UserFigure />
        ) : type === "queue" ? (
          <>
            {[10, -3, -16].map((y) => (
              <g key={y} transform={`translate(0 ${y})`}>
                <path className="face-left" d="M -42 -13 L 0 8 L 0 17 L -42 -4 Z" />
                <path className="face-right" d="M 0 8 L 42 -13 L 42 -4 L 0 17 Z" />
                <path className="face-top" d="M 0 -34 L 42 -13 L 0 8 L -42 -13 Z" />
                {y === -16 && <Glint cx={0} cy={-13} hw={42} hh={21} />}
              </g>
            ))}
            <FaceIcon name={node.icon} cx={0} cy={-29} scale={2.4} />
          </>
        ) : type === "condition" ? (
          <>
            <path className="face-left" d="M -44 -20 L 0 4 L 0 18 L -44 -6 Z" />
            <path className="face-right" d="M 0 4 L 44 -20 L 44 -6 L 0 18 Z" />
            <path className="face-top" d="M 0 -50 L 44 -20 L 0 4 L -44 -20 Z" />
            <Glint cx={0} cy={-23} hw={44} hh={27} />
            <FaceIcon name={node.icon} cx={0} cy={-23} scale={2.4} />
          </>
        ) : type === "start" || type === "end" || type === "initial" || type === "final" ? (
          <>
            <ellipse
              className={type === "start" ? "face-left" : "ink-face"}
              cy="4"
              rx="38"
              ry="19"
            />
            <path
              className={type === "start" ? "face-left" : "ink-face"}
              d="M -38 -8 L -38 4 A 38 19 0 0 0 38 4 L 38 -8 Z"
            />
            <ellipse
              className={type === "start" ? "face-top" : "ink-face"}
              cy="-8"
              rx="38"
              ry="19"
            />
            {type === "start" && <FaceIcon name={node.icon} cx={0} cy={-8} scale={2.1} />}
            {(type === "end" || type === "final") && (
              <>
                <ellipse className="ink-ring" cy="-8" rx="28" ry="14" />
                <ellipse
                  className={type === "final" ? "ink-dot" : "ink-ring"}
                  cy="-8"
                  rx="16"
                  ry="8"
                />
              </>
            )}
          </>
        ) : type === "process" ||
          type === "input" ||
          type === "output" ||
          type === "timer" ||
          type === "event" ||
          type === "state" ? (
          <g className="rounded-solid">
            <path
              className="face-left"
              d={`M -46 -12 L 0 11 L 0 ${type === "state" ? 30 : 19} L -46 ${type === "state" ? 7 : -4} Z`}
            />
            <path
              className="face-right"
              d={`M 0 11 L 46 -12 L 46 ${type === "state" ? 7 : -4} L 0 ${type === "state" ? 30 : 19} Z`}
            />
            <path className="face-top" d="M 0 -35 L 46 -12 L 0 11 L -46 -12 Z" />
            <Glint cx={0} cy={-12} hw={46} hh={23} />
            {type === "timer" ? (
              <g>
                <ellipse className="face-right" cy="-12" rx="22" ry="11" />
                <path className="clock-hand" d="M 0 -12 L 0 -20 M 0 -12 L 9 -9" />
              </g>
            ) : type === "event" ? (
              <path className="bolt" d="M 4 -30 L -12 -10 L -1 -10 L -6 4 L 12 -16 L 1 -16 Z" />
            ) : (
              <FaceIcon name={node.icon} cx={0} cy={-12} scale={2.6} />
            )}
          </g>
        ) : (
          <>
            <path
              className="face-left"
              d={`M -46 -12 L 0 11 L 0 ${tall ? 38 : 20} L -46 ${tall ? 15 : -3} Z`}
            />
            <path
              className="face-right"
              d={`M 0 11 L 46 -12 L 46 ${tall ? 15 : -3} L 0 ${tall ? 38 : 20} Z`}
            />
            <path className="face-top" d="M 0 -35 L 46 -12 L 0 11 L -46 -12 Z" />
            {type !== "client" && <Glint cx={0} cy={-12} hw={46} hh={23} />}
            {type === "client" ? (
              <>
                <path className="laptop-screen" d="M -32 -18 L -32 -58 L 14 -35 L 14 5 Z" />
                <path className="face-top" d="M -26 -21 L -26 -48 L 8 -31 L 8 -4 Z" />
                <path className="laptop-keyboard" d="M -32 -18 L 14 5 L 34 -5 L -12 -28 Z" />
                <path className="server-mark" d="M -11 -19 l 24 12 M -15 -14 l 24 12" />
              </>
            ) : type === "external" ? (
              <path
                className="cloud-face"
                d="M -27 -24 C -49 -26 -47 -52 -26 -54 C -24 -77 7 -77 15 -59 C 39 -62 45 -35 26 -28 Z"
              />
            ) : type === "storage" ? (
              <path className="face-right" d="M 0 -27 L 32 -11 L 0 5 L -32 -11 Z" />
            ) : (
              <FaceIcon name={node.icon} cx={0} cy={-12} scale={2.6} />
            )}
          </>
        )}
      </g>
      {!preview && type !== "zone" && (
        <>
          <text className="node-label" textAnchor="middle" y="52">
            {node.label}
          </text>
          <text className="node-sublabel" textAnchor="middle" y="70">
            {node.sublabel}
          </text>
          {typeof node.data["badge"] === "string" && node.data["badge"] && (
            <g transform="translate(35 -73)">
              <rect
                className="edge-chip"
                width={node.data["badge"].length * 6.6 + 18}
                height="22"
                rx="11"
              />
              <text x="9" y="15" className="edge-label">
                {node.data["badge"]}
              </text>
            </g>
          )}
        </>
      )}
    </g>
  );
}
