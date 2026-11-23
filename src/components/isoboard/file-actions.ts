import { useDiagram, newId } from "@/store/diagram";
import { saveToDevice, openFromDevice, readDiagramFile, rekeyHandle } from "@/lib/file-io";
import { ImportError, SpecError, importValue } from "@/lib/import-diagram";
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

let opening = false;
/** Open a `.isoboard` (or older `.json`) file: from a picker, or a dropped `file`. */
export async function openDiagram(file?: File) {
  const s = useDiagram.getState();
  // A second Open while the picker is still up would fail (or open two dialogs).
  if (opening && !file) return;
  opening = true;
  try {
    const diagram = file ? await readDiagramFile(file) : await openFromDevice();
    if (diagram) openBuilt(diagram);
  } catch (e) {
    s.notify(failure(e, "Couldn't open this file."), true);
  } finally {
    opening = false;
  }
}

const sameContent = (a: Diagram, b: Diagram) =>
  JSON.stringify([a.nodes, a.edges]) === JSON.stringify([b.nodes, b.edges]);

function openBuilt(diagram: Diagram, how = "Opened") {
  const s = useDiagram.getState();
  // Keep what was on the board (an empty board isn't worth a project of its own).
  const persist = () => {
    try {
      useDiagram.getState().save();
      return true;
    } catch {
      return false; // e.g. storage full: the diagram still opens
    }
  };
  if (s.diagram.nodes.length || s.diagram.edges.length) persist();
  // An older copy of a project that has changed since must not overwrite it: open it alongside.
  const existing = useDiagram.getState().projects.find((d) => d.id === diagram.id);
  if (existing && !sameContent(existing, diagram)) {
    const id = newId();
    rekeyHandle(diagram.id, id);
    diagram = { ...diagram, id };
  }
  useDiagram.getState().open(diagram);
  const stored = persist();
  s.notify(
    stored
      ? `${how} ${diagram.name}`
      : `${how} ${diagram.name}, but the browser storage is full: save it to your device.`,
    !stored,
  );
}
const failure = (e: unknown, fallback: string) =>
  e instanceof SpecError
    ? `Can't build this diagram: ${e.message.split("\n")[0]}`
    : e instanceof ImportError
      ? e.message
      : e instanceof DOMException && e.name === "NotAllowedError"
        ? "The browser blocked the file picker. Try again, or drop the file on the board."
        : fallback;

/** Wipes every block and connector from the board (undoable). */
export function clearBoard() {
  const s = useDiagram.getState();
  if (!s.diagram.nodes.length && !s.diagram.edges.length)
    return s.notify("The board is already empty.");
  s.commit((d) => ({ ...d, nodes: [], edges: [] }));
  useDiagram.setState({ selection: [], selectedEdge: null });
  s.notify("Board cleared. Ctrl Z brings it back.");
}

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
