import { useEffect, useState } from "react";
import { Copy, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDiagram } from "@/store/diagram";
import {
  exportRegion,
  rasterize,
  safeScale,
  snapshotCanvas,
  snapshotToPdf,
  type RasterType,
} from "@/lib/export-view";
import { download, fileName, serializeDiagram, EXT } from "@/lib/file-io";

type Format = "png" | "jpeg" | "webp" | "svg" | "pdf" | "isoboard" | "json";
interface Settings {
  format: Format;
  scale: number;
  area: "view" | "diagram";
  background: boolean;
}
const FORMATS: { id: Format; label: string; hint: string }[] = [
  { id: "png", label: "PNG", hint: "Sharp image, transparency optional" },
  { id: "jpeg", label: "JPG", hint: "Small image for chats and email" },
  { id: "webp", label: "WebP", hint: "Small, sharp image for the web" },
  { id: "svg", label: "SVG", hint: "Vector, scales to any size" },
  { id: "pdf", label: "PDF", hint: "One page, ready to print or attach" },
  { id: "isoboard", label: "ISOBOARD", hint: "Editable file — open it again later" },
  { id: "json", label: "JSON", hint: "Raw diagram data" },
];
const RASTER: Partial<Record<Format, RasterType>> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
const EXTENSION: Record<Format, string> = {
  png: ".png",
  jpeg: ".jpg",
  webp: ".webp",
  svg: ".svg",
  pdf: ".pdf",
  isoboard: EXT,
  json: ".json",
};
const DEFAULTS: Settings = { format: "png", scale: 3, area: "view", background: true };
const KEY = "isoboard-export";
function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}
const canvasEl = () => document.querySelector<SVGSVGElement>(".diagram-canvas");

/** Export dialog: format, size (1×–4×), area (view or whole diagram) and background. */
export function ExportDialog({ onClose }: { onClose: () => void }) {
  const diagram = useDiagram((s) => s.diagram);
  const notify = useDiagram((s) => s.notify);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [busy, setBusy] = useState(false);
  const { format, scale, area, background } = settings;
  const raster = !!RASTER[format] || format === "pdf";
  const isImage = format !== "isoboard" && format !== "json";
  // JPEG and PDF have no transparency.
  const canBeTransparent = format === "png" || format === "webp" || format === "svg";
  const set = (patch: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  // Output size preview.
  const svg = canvasEl();
  const region = svg ? exportRegion(svg, area) : null;
  const w = region ? Math.round(region.w * region.unit) : 0,
    h = region ? Math.round(region.h * region.unit) : 0;
  const k = raster ? safeScale(w, h, scale) : 1;
  const size = !isImage
    ? "Editable diagram file"
    : format === "svg"
      ? `${w} × ${h} vector`
      : format === "pdf"
        ? `${Math.round(w * 0.75)} × ${Math.round(h * 0.75)} pt page`
        : `${Math.round(w * k)} × ${Math.round(h * k)} px`;

  async function run(copy = false) {
    const canvas = canvasEl();
    if (!canvas || busy) return;
    setBusy(true);
    const name = fileName(diagram.name, EXTENSION[format]);
    try {
      if (format === "isoboard") download(serializeDiagram(diagram), name, "application/json");
      else if (format === "json")
        download(JSON.stringify(diagram, null, 2), name, "application/json");
      else {
        const snap = await snapshotCanvas(canvas, {
          area,
          background: canBeTransparent ? background : true,
        });
        if (copy) {
          const { blob } = await rasterize(snap, scale, "image/png");
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          notify("Image copied to the clipboard");
          onClose();
          return;
        }
        if (format === "svg") download(snap.svg, name, "image/svg+xml");
        else if (format === "pdf")
          download(await snapshotToPdf(snap, scale), name, "application/pdf");
        else download((await rasterize(snap, scale, RASTER[format])).blob, name, RASTER[format]!);
      }
      notify(`Exported ${name}`);
      onClose();
    } catch {
      notify(
        copy
          ? "Copying images isn't allowed here — try Download."
          : "Export failed — please try again.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-shade" onClick={onClose}>
      <div
        className="export-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-label="Export"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="export-head">
          <h2>Export</h2>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </div>
        <div className="export-field">
          <span>Format</span>
          <div className="export-formats" role="radiogroup" aria-label="Format">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                role="radio"
                aria-checked={format === f.id}
                title={f.hint}
                onClick={() => set({ format: f.id })}
              >
                {f.label}
              </button>
            ))}
          </div>
          <small>{FORMATS.find((f) => f.id === format)?.hint}</small>
        </div>
        {isImage && (
          <>
            <div className="export-field">
              <span>Area</span>
              <div className="export-seg" role="radiogroup" aria-label="Area">
                {(
                  [
                    ["view", "Current view"],
                    ["diagram", "Whole diagram"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={area === id}
                    onClick={() => set({ area: id })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {raster && (
              <div className="export-field">
                <span>Size</span>
                <div className="export-seg" role="radiogroup" aria-label="Size">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      role="radio"
                      aria-checked={scale === n}
                      onClick={() => set({ scale: n })}
                    >
                      {n}×
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label className={`export-check ${canBeTransparent ? "" : "disabled"}`}>
              <input
                type="checkbox"
                checked={canBeTransparent ? background : true}
                disabled={!canBeTransparent}
                onChange={(e) => set({ background: e.target.checked })}
              />
              Paper background & grid
              {!canBeTransparent && <small>always on for {format.toUpperCase()}</small>}
            </label>
          </>
        )}
        <div className="export-foot">
          <span className="export-size">{size}</span>
          {isImage && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void run(true)}
              title="Copy as PNG"
            >
              <Copy />
              Copy
            </Button>
          )}
          <Button disabled={busy} onClick={() => void run()}>
            <Download />
            {busy ? "Exporting…" : "Download"}
          </Button>
        </div>
      </div>
    </div>
  );
}
