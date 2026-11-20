import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registry, paletteGroupOrder } from "@/nodes/registry";
import { importDiagram } from "@/lib/import-diagram";
import { validate } from "@/lib/logic";

// The /isoboard skill (.claude/skills/isoboard) builds .isoboard files outside the app, from a
// copy of the item catalog. These tests keep it in step with the editor.
const skill = join(process.cwd(), ".claude/skills/isoboard");

describe("isoboard skill", () => {
  it("knows every item the editor has", () => {
    const catalog = JSON.parse(readFileSync(join(skill, "scripts/catalog.json"), "utf8"));
    const live = Object.fromEntries(
      Object.entries(registry).map(([t, r]) => [
        t,
        {
          label: r.label,
          description: r.description,
          icon: r.icon,
          color: r.color,
          group: r.paletteGroup,
          modes: r.modes,
          fields: r.inspectorFields,
        },
      ]),
    );
    // Regenerate scripts/catalog.json from the registry when this fails.
    expect(catalog).toEqual({ groups: paletteGroupOrder, types: live });
  });
  it("builds example specs into files the editor opens without warnings", () => {
    const out = mkdtempSync(join(tmpdir(), "isoboard-skill-"));
    const specs = readdirSync(join(skill, "examples")).filter((f) => f.endsWith(".json"));
    expect(specs.length).toBeGreaterThanOrEqual(3);
    for (const spec of specs) {
      const file = join(out, spec.replace(/\.json$/, ".isoboard"));
      const log = execFileSync(
        process.execPath,
        [join(skill, "scripts/build.mjs"), join(skill, "examples", spec), "--out", file],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      expect(log).toContain("wrote");
      const text = readFileSync(file, "utf8");
      const diagram = importDiagram(text);
      expect(validate(diagram)).toEqual([]);
      expect(diagram.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
      // The file passes the skill's own check too.
      execFileSync(process.execPath, [join(skill, "scripts/build.mjs"), "--check", file]);
    }
  });
});
