import { useDiagram } from "@/store/diagram";
import { saveToDevice, openFromDevice, readDiagramFile } from "@/lib/file-io";

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
    if (!diagram) return;
    s.save(); // keep what was on the board
    s.open(diagram);
    useDiagram.getState().save();
    s.notify(`Opened ${diagram.name}`);
  } catch {
    s.notify("This file is not a valid Isoboard diagram.", true);
  }
}
