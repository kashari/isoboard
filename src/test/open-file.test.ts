import { describe, it, expect, beforeEach } from "vitest";
import { importDiagram, ImportError } from "@/lib/import-diagram";
import { serializeDiagram } from "@/lib/file-io";
import { openDiagram, clearBoard } from "@/components/isoboard/file-actions";
import { useDiagram, emptyDiagram } from "@/store/diagram";
import { makeDemo } from "@/lib/demo";
import { registry } from "@/nodes/registry";

const file = (text: string, name = "board.isoboard") => new File([text], name);

describe("opening files", () => {
  beforeEach(() => {
    localStorage.clear();
    useDiagram.setState({ diagram: emptyDiagram(), projects: [], past: [], future: [] });
  });

  it("round-trips a saved diagram", () => {
    const d = makeDemo();
    expect(importDiagram(serializeDiagram(d))).toEqual(d);
  });

  it("tolerates a byte-order mark, loose fields and an odd viewport", () => {
    const d = importDiagram(
      "﻿" +
        JSON.stringify({
          format: "isoboard",
          diagram: {
            id: "x",
            name: "Loose",
            nodes: [
              { id: "a", type: "service", gx: 1.4, gy: "2", color: "pink" },
              { id: "b", type: "database", gx: 3, gy: 0, label: "DB", icon: "" },
            ],
            edges: [
              { id: "e", from: "a", to: "b" },
              { id: "gone", from: "a", to: "missing", label: "x", style: "solid", kind: "plain" },
            ],
            viewport: { x: 10, y: 5, zoom: 9 },
          },
        }),
    );
    expect(d.nodes[0]).toMatchObject({
      gx: 1,
      gy: 2,
      gz: 0,
      label: registry.service.label,
      sublabel: "",
    });
    expect(d.nodes[0]!.color).not.toBe("pink");
    expect(d.nodes[1]!.icon).not.toBe("");
    expect(d.edges).toEqual([
      { id: "e", from: "a", to: "b", label: "", style: "solid", kind: "plain", data: {} },
    ]);
    expect(d.viewport.zoom).toBe(2.5);
  });

  it("explains what is wrong with a bad file", () => {
    expect(() => importDiagram("{ nope")).toThrow(/valid JSON/);
    expect(() =>
      importDiagram(
        '{"id": "d", "name": "D", "nodes": [{"id": "a", "type": "spaceship", "gx": 0, "gy": 0}], "edges": [], "viewport": {}}',
      ),
    ).toThrow(ImportError);
  });

  it("opens a dropped file and reports a broken one", async () => {
    await openDiagram(file(serializeDiagram({ ...makeDemo(), id: "f1", name: "From file" })));
    expect(useDiagram.getState().diagram.name).toBe("From file");
    expect(useDiagram.getState().projects.map((p) => p.id)).toContain("f1");
    await openDiagram(file("hello", "notes.txt"));
    expect(useDiagram.getState().notice).toMatchObject({ error: true });
    expect(useDiagram.getState().diagram.name).toBe("From file");
  });

  it("doesn't overwrite a project that changed since the file was saved", async () => {
    const saved = { ...makeDemo(), id: "p1", name: "Project" };
    await openDiagram(file(serializeDiagram(saved)));
    useDiagram.getState().commit((d) => ({ ...d, nodes: d.nodes.slice(1) }));
    useDiagram.getState().save();
    await openDiagram(file(serializeDiagram(saved)));
    const { diagram, projects } = useDiagram.getState();
    expect(diagram.id).not.toBe("p1");
    expect(projects.find((p) => p.id === "p1")!.nodes.length).toBe(saved.nodes.length - 1);
    // Re-opening an unchanged copy just goes back to that project.
    await openDiagram(file(serializeDiagram(diagram)));
    expect(useDiagram.getState().projects.length).toBe(2);
  });

  it("clears the board, undoably", () => {
    useDiagram.getState().open(makeDemo());
    clearBoard();
    expect(useDiagram.getState().diagram.nodes).toEqual([]);
    expect(useDiagram.getState().diagram.edges).toEqual([]);
    useDiagram.getState().undo();
    expect(useDiagram.getState().diagram.nodes.length).toBeGreaterThan(0);
  });
});
