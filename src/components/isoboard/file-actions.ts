import { useDiagram } from "@/store/diagram";
import { saveToDevice, openFromDevice, readDiagramFile } from "@/lib/file-io";
import { SpecError, importValue } from "@/lib/import-diagram";
import { readHashPayload } from "@/lib/spec";
import type { Diagram } from "@/types/diagram";

/** Save the current diagram to a `.isoboard` file (Ctrl S; Ctrl Shift S = save as). */
export async function saveDiagram(saveAs = false) {
  const s = useDiagram.getState();
  try {
    const name = await saveToDevice(s.diagram, saveAs);
    if (name) s.notify(`Saved ${name}`);
  } catch {
    s.notify("Could not save the file — please try again.", true);
  }
}

/** Open a `.isoboard` (or older `.json`) file: from a picker, or a dropped `file`. */
export async function openDiagram(file?: File) {
  const s = useDiagram.getState();
  try {
    const diagram = file ? await readDiagramFile(file) : await openFromDevice();
    if (diagram) openBuilt(diagram);
  } catch (e) {
    s.notify(failure(e, "This file is not a valid Isoboard diagram."), true);
  }
}

function openBuilt(diagram: Diagram, how = "Opened") {
  const s = useDiagram.getState();
  // Keep what was on the board (an empty board isn't worth a project of its own).
  if (s.diagram.nodes.length || s.diagram.edges.length) s.save();
  s.open(diagram);
  useDiagram.getState().save();
  s.notify(`${how} ${diagram.name}`);
}
const failure = (e: unknown, fallback: string) =>
  e instanceof SpecError ? `Can't build this diagram: ${e.message.split("\n")[0]}` : fallback;

/**
 * Opens the diagram a link carries (`#spec=…` or `#diagram=…`) as a new
 * project, then clears the hash so a reload doesn't open it twice.
 */
export async function openFromLink() {
  if (typeof window === "undefined" || !/^#(spec|diagram|isoboard)=/.test(window.location.hash))
    return;
  const s = useDiagram.getState();
  const hash = window.location.hash;
  history.replaceState(null, "", window.location.pathname + window.location.search);
  try {
    const raw = await readHashPayload(hash);
    if (raw) openBuilt(importValue(raw));
  } catch (e) {
    s.notify(failure(e, "This link doesn't hold a valid Isoboard diagram."), true);
  }
}
