import type { Diagram, Edge, Node, NodeType } from "@/types/diagram";
/** Everything that takes part in a state machine; connectors touching these are transitions. */
export const STATE_TYPES: NodeType[] = [
  "state",
  "initial",
  "final",
  "composite",
  "terminate",
  "choice",
  "junction",
  "fork",
  "history",
  "entry",
  "exit",
  "guard",
  "orthogonal",
  "region",
  "send",
  "receive",
  "submachine",
];
/** Where a machine can start, and where it must stop. */
const START_TYPES: NodeType[] = ["initial", "entry"];
const END_TYPES: NodeType[] = ["final", "terminate"];
const hasGuard = (e: Edge) => String(e.data["guard"] ?? "").trim() !== "";
export function transitionLabel(edge: Edge): string {
  const event = String(edge.data["event"] ?? "").trim();
  const guard = String(edge.data["guard"] ?? "").trim();
  const action = String(edge.data["action"] ?? "").trim();
  const text = [event, guard && `[${guard}]`, action && `/ ${action}`].filter(Boolean).join(" ");
  return text || edge.label;
}
export function edgeText(edge: Edge): string {
  return edge.kind === "transition" ? transitionLabel(edge) : edge.label;
}
/** Picks the default label/kind (and style/data where it matters) for a new edge. */
export function defaultEdge(
  from: Node | undefined,
  existing: Edge[],
  to?: Node,
): Pick<Edge, "label" | "kind"> & Partial<Pick<Edge, "style" | "data">> {
  if (from?.type === "condition") {
    const used = existing.filter((e) => e.from === from.id).map((e) => e.label);
    const label = ["true", "false"].find((l) => !used.includes(l)) ?? `branch ${used.length + 1}`;
    return { label, kind: "plain" };
  }
  // An event broadcast from one orthogonal region to another: a dashed signal with a bolt.
  if (from?.type === "send" || to?.type === "receive")
    return { label: "event", kind: "signal", style: "dashed", data: { icon: "Zap" } };
  // Orthogonal state → its regions, region → its sub-states: containment, not a transition.
  if (from?.type === "region" || (from?.type === "orthogonal" && to?.type === "region"))
    return { label: "", kind: "plain", style: "dotted" };
  // Anything touching a state (e.g. Event → State) is a transition.
  if ([from, to].some((n) => n && STATE_TYPES.includes(n.type)))
    return { label: "event", kind: "transition" };
  // A plain, unlabelled connector: name it only if it needs a name.
  return { label: "", kind: "plain" };
}
/** Blocks whose outgoing connectors are alternative branches, not consecutive steps. */
const BRANCHING = new Set<NodeType>(["condition", "choice"]);
/**
 * Step number of each connector, in `edges` order. The branches out of a condition (or a choice)
 * are alternatives, so they are one step: every branch shares the number of the first.
 */
export function stepNumbers(nodes: Node[], edges: Edge[]): Map<string, number> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, number>();
  const branch = new Map<string, number>();
  let k = 0;
  for (const e of edges) {
    const from = byId.get(e.from);
    if (!from || !byId.has(e.to) || e.from === e.to) continue;
    if (BRANCHING.has(from.type)) {
      if (!branch.has(e.from)) branch.set(e.from, ++k);
      out.set(e.id, branch.get(e.from)!);
    } else out.set(e.id, ++k);
  }
  return out;
}
/**
 * How a flow ends at a block, for marking end transitions: a good end (end, final, terminate,
 * exit) or a failure (KO, error, exception). Null when the flow goes on.
 */
export function endKind(n: Node | undefined): { text: string; tone: "ok" | "fail" } | null {
  switch (n?.type) {
    case "end":
    case "final":
    case "terminate":
    case "exit":
      return { text: "End", tone: "ok" };
    case "ko":
      return { text: "KO", tone: "fail" };
    case "error":
      return { text: "Error", tone: "fail" };
    case "exception":
      return { text: "Exception", tone: "fail" };
    default:
      return null;
  }
}
/** A condition's branch reads as a yes (green) or a no (red), from its label. */
export function branchTone(edge: Edge, from: Node | undefined): "yes" | "no" | "" {
  if (from?.type !== "condition") return "";
  const t = edge.label.trim().toLowerCase();
  if (/^(true|yes|y|ok|valid|success|pass(ed)?)$/.test(t)) return "yes";
  if (/^(false|no|n|ko|invalid|fail(ed|ure)?|error|else)$/.test(t)) return "no";
  return "";
}
export type Issue = { id: string; message: string; nodeId?: string; edgeId?: string };
export function validate(d: Diagram): Issue[] {
  const issues: Issue[] = [];
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  for (const e of d.edges)
    if (!byId.has(e.from) || !byId.has(e.to))
      issues.push({
        id: `dangling-${e.id}`,
        message: `Connection "${edgeText(e)}" has a missing end`,
        edgeId: e.id,
      });
  for (const n of d.nodes.filter((n) => n.type === "condition")) {
    const labels = new Set(d.edges.filter((e) => e.from === n.id).map((e) => e.label.trim()));
    if (labels.size < 2)
      issues.push({
        id: `branch-${n.id}`,
        message: `Condition "${n.label}" needs two branches`,
        nodeId: n.id,
      });
  }
  const states = d.nodes.filter((n) => STATE_TYPES.includes(n.type));
  const outgoing = (id: string) => d.edges.filter((e) => e.from === id && byId.has(e.to));
  const incoming = (id: string) => d.edges.filter((e) => e.to === id && byId.has(e.from));
  for (const n of states) {
    const out = outgoing(n.id);
    const add = (key: string, message: string) =>
      issues.push({ id: `${key}-${n.id}`, message, nodeId: n.id });
    if (END_TYPES.includes(n.type) && out.length)
      add("end-out", `"${n.label}" ends the machine — it can't have outgoing transitions`);
    if (n.type === "initial" && out.length > 1)
      add("initial-many", `Initial state "${n.label}" should have exactly one outgoing transition`);
    if (n.type === "choice") {
      if (out.length < 2) add("choice-branches", `Choice "${n.label}" needs at least two branches`);
      else if (out.filter((e) => !hasGuard(e)).length > 1)
        add("choice-guards", `Choice "${n.label}": give each branch a guard (one may be [else])`);
    }
    if (n.type === "fork" && out.length < 2 && incoming(n.id).length < 2)
      add("fork-arity", `Fork / join "${n.label}" needs 2+ outgoing (fork) or 2+ incoming (join)`);
    if (n.type === "guard" && !out.length)
      add("guard-out", `Guard "${n.label}" doesn't lead anywhere`);
    if (n.type === "orthogonal" && out.filter((e) => byId.get(e.to)?.type === "region").length < 2)
      add(
        "orthogonal-regions",
        `Orthogonal state "${n.label}" needs 2+ regions running in parallel`,
      );
    if (n.type === "send" && !out.some((e) => e.kind === "signal"))
      add("send-out", `Send "${n.label}" doesn't signal anything`);
    if (n.type === "receive" && !incoming(n.id).some((e) => e.kind === "signal"))
      add("receive-in", `Receive "${n.label}" never gets its event`);
    if (n.type === "region" && !incoming(n.id).length)
      add("region-in", `Region "${n.label}" belongs to no orthogonal state`);
    if (n.type === "history" && !incoming(n.id).length)
      add("history-in", `History "${n.label}" has no transition into it`);
  }
  if (states.length) {
    const initials = states.filter((n) => START_TYPES.includes(n.type));
    if (!initials.length)
      issues.push({ id: "no-initial", message: "State machine has no initial state" });
    const seen = new Set(initials.map((n) => n.id));
    const queue = [...seen];
    while (queue.length) {
      const id = queue.shift();
      for (const e of d.edges)
        if (e.from === id && !seen.has(e.to) && byId.has(e.to)) {
          seen.add(e.to);
          queue.push(e.to);
        }
    }
    if (initials.length)
      for (const n of states)
        if (!seen.has(n.id))
          issues.push({
            id: `unreachable-${n.id}`,
            message: `State "${n.label}" is unreachable`,
            nodeId: n.id,
          });
  }
  return issues;
}
