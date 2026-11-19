import { importDiagram } from "./import-diagram";
import type { Diagram } from "@/types/diagram";

/**
 * Save to device / open from device with `.isoboard` files (JSON with a small envelope).
 *
 * Where the browser supports the File System Access API (Chrome, Edge), the first save asks
 * for a location and later saves (Ctrl S) write to the same file silently. Elsewhere a save
 * downloads the file and Open uses a regular file picker.
 */
export const EXT = ".isoboard";
const MIME = "application/x-isoboard+json";

/** A file name that is safe on every OS. */
export function fileName(name: string, ext: string) {
  const printable = [...name].map((c) => (c.charCodeAt(0) < 32 ? "-" : c)).join("");
  const base = printable
    .replace(/[\\/:*?"<>|]+/g, "-")
    .trim()
    .slice(0, 120);
  return (base || "diagram") + ext;
}

export function serializeDiagram(diagram: Diagram) {
  return JSON.stringify(
    { format: "isoboard", version: 1, savedAt: new Date().toISOString(), diagram },
    null,
    2,
  );
}

export function download(content: string | Blob, name: string, type: string) {
  const url = URL.createObjectURL(
    content instanceof Blob ? content : new Blob([content], { type }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Writable {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
interface FileHandle {
  name: string;
  createWritable(): Promise<Writable>;
  getFile(): Promise<File>;
}
interface Pickers {
  showSaveFilePicker?: (options: unknown) => Promise<FileHandle>;
  showOpenFilePicker?: (options: unknown) => Promise<FileHandle[]>;
}
const pickers = () => (typeof window === "undefined" ? {} : (window as unknown as Pickers));
const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";
/** File each diagram was last saved to / opened from in this session (diagram id → handle). */
const handles = new Map<string, FileHandle>();
const types = [{ description: "Isoboard diagram", accept: { [MIME]: [EXT] } }];

/**
 * Saves the diagram as a `.isoboard` file. Returns the file name, or null if the user
 * cancelled the save dialog.
 */
export async function saveToDevice(diagram: Diagram, saveAs = false): Promise<string | null> {
  const blob = new Blob([serializeDiagram(diagram)], { type: MIME });
  let handle = saveAs ? undefined : handles.get(diagram.id);
  const { showSaveFilePicker } = pickers();
  if (!handle && showSaveFilePicker) {
    try {
      handle = await showSaveFilePicker({ suggestedName: fileName(diagram.name, EXT), types });
    } catch (e) {
      if (isAbort(e)) return null;
      handle = undefined; // e.g. blocked in an iframe: fall back to a download
    }
  }
  if (handle) {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    handles.set(diagram.id, handle);
    return handle.name;
  }
  const name = fileName(diagram.name, EXT);
  download(blob, name, MIME);
  return name;
}

/** Reads a `.isoboard` (or older `.json`) diagram file; throws if it is not a valid diagram. */
export async function readDiagramFile(file: File): Promise<Diagram> {
  return importDiagram(await file.text());
}

/** Lets the user pick a diagram file. Returns null if they cancelled. */
export async function openFromDevice(): Promise<Diagram | null> {
  const { showOpenFilePicker } = pickers();
  if (showOpenFilePicker) {
    let handle: FileHandle | undefined;
    try {
      [handle] = await showOpenFilePicker({
        types: [
          {
            description: "Isoboard diagram",
            accept: { [MIME]: [EXT], "application/json": [".json"] },
          },
        ],
      });
    } catch (e) {
      if (isAbort(e)) return null;
    }
    if (handle) {
      const file = await handle.getFile();
      const diagram = await readDiagramFile(file);
      if (file.name.endsWith(EXT)) handles.set(diagram.id, handle);
      return diagram;
    }
  }
  const file = await new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `${EXT},.json,application/json`;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
  return file ? readDiagramFile(file) : null;
}
