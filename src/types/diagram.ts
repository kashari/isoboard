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
  "ko",
  "error",
  "exception",
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
  "orthogonal",
  "region",
  "send",
  "receive",
  "submachine",
  "kid",
  "boy",
  "girl",
  "man",
  "woman",
  "elder",
  "developer",
  "group",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];
export type NodeColor = "amber" | "blue" | "lavender" | "mint" | "peach" | "stone";
export type EdgeStyle = "solid" | "dashed" | "dotted" | "bidirectional";
export const EDGE_KINDS = [
  "plain",
  "request",
  "response",
  "handshake",
  "transition",
  "signal",
] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];
export const LINE_STYLES = ["sketch", "clean"] as const;
export type LineStyle = (typeof LINE_STYLES)[number];
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
export type NoteColor = "yellow" | "pink" | "mint" | "sky" | "lavender" | "paper";
/** A flat, hand-drawn note. `x, y` (top-left) are canvas px, relative to the block's origin when
 * `attach` names a block. */
export interface Note {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: NoteColor;
  attach?: string | undefined;
  /** Where the note's line ends: relative to the `attach` block's origin, or on the board when
   * the note is free. Without it, an attached note points at the top of its block. */
  pin?: { x: number; y: number } | undefined;
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
  /** How connectors are drawn: by hand (the default) or as clean, smooth lines. */
  lines?: LineStyle | undefined;
  /** Notes on the board (see lib/notes). */
  notes?: Note[] | undefined;
}
