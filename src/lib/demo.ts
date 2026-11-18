import type { Diagram, Node, NodeColor, NodeType } from "@/types/diagram";
function node(
  id: string,
  type: NodeType,
  gx: number,
  gy: number,
  label: string,
  sublabel: string,
  color: NodeColor,
  icon: string,
  data: Record<string, unknown> = {},
): Node {
  return { id, type, gx, gy, gz: 0, label, sublabel, color, icon, data };
}
export function makeDemo(): Diagram {
  return {
    id: "demo-web-architecture",
    name: "Web application architecture",
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      node("zone-web", "zone", 3, -3, "APPLICATION LAYER", "", "blue", "Layers", {
        width: 8,
        height: 5,
      }),
      node("zone-data", "zone", 9, -6, "DATA LAYER", "", "lavender", "Layers", {
        width: 4,
        height: 5,
      }),
      node("user", "user", -5, 0, "User", "The beginning of a request", "mint", "UserRound"),
      node("client", "client", -1, 0, "Client", "Browser · HTTPS", "stone", "Laptop"),
      node("dns", "service", 3, -1, "DNS", "Resolves the address", "amber", "Globe"),
      node("web", "service", 7, -3, "Web server", "Handles the request", "blue", "Server"),
      node("db", "database", 11, -5, "Database", "PostgreSQL · primary", "lavender", "Database", {
        engine: "PostgreSQL",
        port: "5432",
        notes: "Stores users, sessions, and application data.",
      }),
    ],
    edges: [
      {
        id: "e1",
        from: "user",
        to: "client",
        label: "Interaction",
        style: "solid",
        kind: "request",
        data: {},
      },
      {
        id: "e2",
        from: "client",
        to: "dns",
        label: "DNS lookup",
        style: "dashed",
        kind: "handshake",
        data: {},
      },
      {
        id: "e3",
        from: "dns",
        to: "web",
        label: "HTTPS / 443",
        style: "solid",
        kind: "request",
        data: {},
      },
      {
        id: "e4",
        from: "web",
        to: "db",
        label: "SQL query",
        style: "bidirectional",
        kind: "response",
        data: {},
      },
    ],
  };
}
