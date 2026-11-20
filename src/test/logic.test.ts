import { describe, expect, it } from "vitest";
import { validate, transitionLabel, defaultEdge } from "@/lib/logic";
import type { Diagram, Node, Edge } from "@/types/diagram";
const n = (id: string, type: Node["type"]): Node => ({
  id,
  type,
  gx: 0,
  gy: 0,
  gz: 0,
  label: id,
  sublabel: "",
  color: "stone",
  icon: "Box",
  data: {},
});
const e = (id: string, from: string, to: string, label = "x"): Edge => ({
  id,
  from,
  to,
  label,
  style: "solid",
  kind: "transition",
  data: {},
});
const d = (nodes: Node[], edges: Edge[]): Diagram => ({
  id: "d",
  name: "d",
  nodes,
  edges,
  viewport: { x: 0, y: 0, zoom: 1 },
});
describe("Logic validation", () => {
  it("warns when a state machine has no initial state", () => {
    expect(validate(d([n("a", "state")], [])).map((i) => i.id)).toContain("no-initial");
  });
  it("flags states not reachable from the initial state", () => {
    const issues = validate(
      d([n("i", "initial"), n("a", "state"), n("b", "state")], [e("1", "i", "a")]),
    );
    expect(issues.map((i) => i.nodeId)).toEqual(["b"]);
  });
  it("requires conditions to have both branches", () => {
    const one = d([n("c", "condition"), n("x", "process")], [e("1", "c", "x", "true")]);
    expect(validate(one)[0]?.nodeId).toBe("c");
    one.edges.push(e("2", "c", "x", "false"));
    expect(validate(one)).toEqual([]);
  });
  it("requires choices to branch at least twice, with guards", () => {
    const nodes = [n("i", "initial"), n("c", "choice"), n("a", "state"), n("b", "state")];
    const ids = (edges: Edge[]) => validate(d(nodes, edges)).map((i) => i.id);
    expect(ids([e("0", "i", "c"), e("1", "c", "a")])).toContain("choice-branches-c");
    const two = [e("0", "i", "c"), e("1", "c", "a"), e("2", "c", "b")];
    expect(ids(two)).toContain("choice-guards-c");
    two[1]!.data = { guard: "ok" };
    expect(ids(two)).toEqual([]);
  });
  it("treats entry points as starts and forbids transitions out of terminal states", () => {
    const nodes = [n("en", "entry"), n("a", "state"), n("t", "terminate")];
    const issues = validate(d(nodes, [e("1", "en", "a"), e("2", "a", "t"), e("3", "t", "a")]));
    expect(issues.map((i) => i.id)).toEqual(["end-out-t"]);
  });
  it("accepts a fork that splits and a join that merges", () => {
    const nodes = [
      n("i", "initial"),
      n("f", "fork"),
      n("a", "state"),
      n("b", "state"),
      n("j", "fork"),
    ];
    const edges = [
      e("0", "i", "f"),
      e("1", "f", "a"),
      e("2", "f", "b"),
      e("3", "a", "j"),
      e("4", "b", "j"),
    ];
    expect(validate(d(nodes, edges))).toEqual([]);
  });
  it("flags dangling edges", () => {
    expect(validate(d([n("a", "process")], [e("1", "a", "ghost")]))[0]?.edgeId).toBe("1");
  });
  it("formats transitions as event [guard] / action", () => {
    const t = e("1", "a", "b");
    t.data = { event: "submit", guard: "valid", action: "save()" };
    expect(transitionLabel(t)).toBe("submit [valid] / save()");
  });
  it("labels condition branches true then false", () => {
    const c = n("c", "condition");
    expect(defaultEdge(c, []).label).toBe("true");
    expect(defaultEdge(c, [e("1", "c", "x", "true")]).label).toBe("false");
  });
  it("treats any connector touching a state as a transition", () => {
    expect(defaultEdge(n("ev", "event"), [], n("s", "state")).kind).toBe("transition");
    expect(defaultEdge(n("s", "state"), []).kind).toBe("transition");
    expect(defaultEdge(n("p", "process"), [], n("q", "process")).kind).toBe("plain");
  });
  it("models orthogonal regions and the events their children send each other", () => {
    // Send → anything (or anything → receive) is a dashed signal with a bolt sticker.
    expect(defaultEdge(n("s", "send"), [], n("r", "receive"))).toMatchObject({
      kind: "signal",
      style: "dashed",
      data: { icon: "Zap" },
    });
    expect(defaultEdge(n("a", "state"), [], n("r", "receive")).kind).toBe("signal");
    // Leaving an orthogonal state is still a transition; only orthogonal → region is containment.
    expect(defaultEdge(n("o", "orthogonal"), [], n("i", "state")).kind).toBe("transition");
    // Orthogonal → region is containment, drawn dotted.
    expect(defaultEdge(n("o", "orthogonal"), [], n("r", "region"))).toMatchObject({
      kind: "plain",
      style: "dotted",
    });
    const sig = (id: string, from: string, to: string): Edge => ({
      ...e(id, from, to),
      kind: "signal",
    });
    const nodes = [
      n("i", "initial"),
      n("o", "orthogonal"),
      n("r1", "region"),
      n("r2", "region"),
      n("s", "send"),
      n("rc", "receive"),
    ];
    const ok = [
      e("1", "i", "o"),
      e("2", "o", "r1"),
      e("3", "o", "r2"),
      e("4", "r1", "s"),
      sig("5", "s", "rc"),
    ];
    expect(validate(d(nodes, ok))).toEqual([]);
    // One region only, and a send that signals nobody (so the receive never hears it).
    const ids = validate(
      d(
        nodes,
        ok.filter((x) => x.id !== "3" && x.id !== "5"),
      ),
    ).map((i) => i.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "orthogonal-regions-o",
        "send-out-s",
        "receive-in-rc",
        "region-in-r2",
      ]),
    );
  });
});
