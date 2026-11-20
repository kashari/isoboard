import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { importDiagram } from "@/lib/import-diagram";
import { validate } from "@/lib/logic";
import { buildSpec, readHashPayload } from "@/lib/spec";

const flow = {
  name: "Sign-up flow",
  nodes: [
    { id: "s", type: "start", label: "Visit" },
    { id: "form", type: "input", label: "Fill form" },
    { id: "ok", type: "condition", label: "Valid?" },
    { id: "save", type: "process", label: "Create account" },
    { id: "fix", type: "output", label: "Show errors" },
    { id: "e", type: "end", label: "Welcome" },
  ],
  edges: [
    "s -> form",
    "form -> ok",
    "ok -> save: true",
    "ok -> fix: false",
    "fix -> form: retry",
    "save -> e",
  ],
};

const states = {
  name: "Media player",
  nodes: [
    { id: "init", type: "initial", label: "start" },
    { id: "idle", type: "state", label: "Idle" },
    { id: "playing", type: "orthogonal", label: "Playing" },
    { id: "audio", type: "region", label: "Audio" },
    { id: "video", type: "region", label: "Video" },
    { id: "buffer", type: "send", label: "buffered!" },
    { id: "wait", type: "receive", label: "on buffered" },
    { id: "decode", type: "submachine", label: "Decoder", data: { machine: "H.264" } },
    { id: "done", type: "final", label: "end" },
  ],
  edges: [
    "init -> idle",
    "idle -> playing: play [hasMedia] / load()",
    "playing -> audio",
    "playing -> video",
    "audio -> buffer: ready",
    "buffer -> wait: buffered",
    "video -> wait: waiting",
    "wait -> decode: buffered",
    "decode -> done: eof",
    "playing -> idle: stop",
  ],
};

const shop = {
  name: "Shop",
  steps: true,
  nodes: [
    { id: "customer", type: "woman", label: "Customer" },
    { id: "web", type: "client", label: "Web shop" },
    { id: "orders", type: "springboot", label: "Orders", data: { port: "8081" } },
    { id: "db", type: "postgres", label: "Orders DB" },
    { id: "events", type: "kafka", label: "order-events" },
  ],
  zones: [{ label: "Backend", contains: ["orders", "db", "events"], color: "blue" }],
  edges: [
    "customer -> web: browses",
    "web -> orders: POST /orders",
    "orders -> db: SQL",
    { from: "orders", to: "events", label: "OrderPlaced", style: "dashed", icon: "Kafka" },
  ],
};

describe("diagram specs", () => {
  it("build into clean diagrams the editor opens", () => {
    for (const spec of [flow, states, shop]) {
      const built = buildSpec(spec);
      expect(built.errors).toEqual([]);
      expect(built.warnings).toEqual([]);
      expect(validate(built.diagram!)).toEqual([]);
      expect(importDiagram(JSON.stringify(built.diagram))).toEqual(built.diagram);
    }
  });

  it("fill in connector defaults and parse transitions", () => {
    const d = buildSpec(states).diagram!;
    const edge = (from: string, to: string) => {
      const id = (key: string) => d.nodes.find((n) => n.label === key)!.id;
      return d.edges.find((e) => e.from === id(from) && e.to === id(to))!;
    };
    expect(edge("Idle", "Playing")).toMatchObject({
      kind: "transition",
      data: { event: "play", guard: "hasMedia", action: "load()" },
    });
    expect(edge("Playing", "Audio")).toMatchObject({ kind: "plain", style: "dotted" });
    expect(edge("buffered!", "on buffered")).toMatchObject({ kind: "signal", style: "dashed" });
  });

  it("open from links: compressed, base64 or plain JSON, and from spec files", async () => {
    const spec = {
      name: "Link",
      nodes: [
        { id: "a", type: "user" },
        { id: "b", type: "service" },
      ],
      edges: ["a -> b: hi"],
    };
    const json = JSON.stringify(spec);
    for (const hash of [
      "#spec=" + encodeURIComponent(json),
      "#spec=" + Buffer.from(json).toString("base64url"),
      "#spec=" + deflateSync(Buffer.from(json), { level: 9 }).toString("base64url"),
    ])
      expect(await readHashPayload(hash)).toEqual(spec);
    const fromFile = importDiagram(JSON.stringify({ format: "isoboard-spec", version: 1, spec }));
    expect(fromFile.nodes.map((n) => n.type)).toEqual(["user", "service"]);
    expect(fromFile.edges[0]).toMatchObject({ label: "hi", kind: "plain" });
  });

  it("explain mistakes", () => {
    expect(() =>
      importDiagram(
        JSON.stringify({
          format: "isoboard-spec",
          spec: { nodes: [{ id: "x", type: "postgress" }] },
        }),
      ),
    ).toThrow(/postgres/);
  });
});
