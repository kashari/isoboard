export const NODE_TYPES = [
  "client",
  "user",
  "service",
  "database",
  "cache",
  "queue",
  "balancer",
  "external",
  "storage",
  "box",
  "note",
  "zone",
  "start",
  "end",
  "condition",
  "process",
  "input",
  "output",
  "timer",
  "event",
  "state",
  "initial",
  "final",
  "mobile",
  "cdn",
  "firewall",
  "gateway",
  "function",
  "auth",
  "analytics",
  "mail",
  "ai",
  "pyramid",
  "sphere",
  "cone",
  "choice",
  "junction",
  "fork",
  "history",
  "entry",
  "exit",
  "terminate",
  "composite",
  "guard",
  "springboot",
  "postgres",
  "oracle",
  "mysql",
  "mongodb",
  "redis",
  "kafka",
  "rabbitmq",
  "elastic",
  "kubernetes",
  "docker",
  "nginx",
  "file",
  "file-pdf",
  "file-csv",
  "file-json",
  "file-xml",
  "file-xlsx",
  "file-docx",
  "file-zip",
  "file-img",
  "file-video",
  "file-txt",
  "file-yaml",
  "file-log",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];
export type NodeColor = "amber" | "blue" | "lavender" | "mint" | "peach" | "stone";
export type EdgeStyle = "solid" | "dashed" | "dotted" | "bidirectional";
export const EDGE_KINDS = ["plain", "request", "response", "handshake", "transition"] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];
export type Mode = "architecture" | "flow" | "state";
export interface Node {
  id: string;
  type: NodeType;
  gx: number;
  gy: number;
  gz: number;
  label: string;
  sublabel: string;
  color: NodeColor;
  icon: string;
  data: Record<string, unknown>;
}
export interface Edge {
  id: string;
  from: string;
  to: string;
  label: string;
  style: EdgeStyle;
  kind: EdgeKind;
  data: Record<string, unknown>;
}
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}
export interface Diagram {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
  viewport: Viewport;
  /** Show sequential step numbers (1, 2, 3…) on connectors, in `edges` order. */
  steps?: boolean | undefined;
}
