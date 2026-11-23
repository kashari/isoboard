/**
 * Exports exactly what the canvas currently shows (same viewport, theme and colours) as a
 * self-contained SVG or a high-resolution PNG.
 *
 * Instead of shipping the app stylesheet (which depends on CSS variables,
 * oklch()/color-mix() and a Google-hosted font — none of which survive outside the app), every
 * element's *computed* style is baked into plain SVG presentation attributes with sRGB colours,
 * the paper background is added, and the UI font is embedded as data URLs.
 */
const SVG_NS = "http://www.w3.org/2000/svg";

/** Interaction-only parts of the canvas that should never appear in an export. */
const UI_ONLY = [
  ".connection-handle",
  ".connection-center",
  ".edge-hit",
  ".selection-ground",
  ".marquee",
  ".connecting-line",
  ".segment-grip",
  ".flow-dot",
  ".note-ui",
  "foreignObject",
  "title",
].join(",");

const PAINT_PROPS = ["fill", "stroke"] as const;
const SHAPE_PROPS = [
  "stroke-width",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "fill-rule",
  "opacity",
  "paint-order",
] as const;
const TEXT_PROPS = [
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "letter-spacing",
  "text-anchor",
  "dominant-baseline",
] as const;
/** Values equal to the SVG defaults are left out to keep the file small. */
const DEFAULTS: Record<string, string> = {
  "stroke-dasharray": "none",
  "stroke-dashoffset": "0px",
  "stroke-linecap": "butt",
  "stroke-linejoin": "miter",
  "stroke-miterlimit": "4",
  "fill-rule": "nonzero",
  opacity: "1",
  "paint-order": "normal",
  "font-style": "normal",
  "letter-spacing": "normal",
  "text-anchor": "start",
  "dominant-baseline": "auto",
};

let probe: CanvasRenderingContext2D | null = null;
const colorCache = new Map<string, [string, number]>();
/** Resolves any CSS colour (oklch, color-mix, color(), …) to `rgb()` + alpha via a 1px canvas. */
function toRgb(value: string): [string, number] | null {
  if (!value || value === "none" || value.startsWith("url(")) return null;
  const cached = colorCache.get(value);
  if (cached) return cached;
  probe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!probe) return null;
  probe.canvas.width = probe.canvas.height = 1;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#000";
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 0] = probe.getImageData(0, 0, 1, 1).data;
  const result: [string, number] = [`rgb(${r}, ${g}, ${b})`, Math.round((a / 255) * 1000) / 1000];
  colorCache.set(value, result);
  return result;
}

/** Copies the computed look of `src` onto `dst` as presentation attributes. */
function bakeStyle(src: Element, dst: Element) {
  const cs = getComputedStyle(src);
  for (const prop of PAINT_PROPS) {
    const raw = cs.getPropertyValue(prop).trim();
    if (raw.startsWith("url(")) continue; // keep marker/gradient references as authored
    const rgb = toRgb(raw);
    if (!rgb || rgb[1] === 0) {
      dst.setAttribute(prop, "none");
      continue;
    }
    dst.setAttribute(prop, rgb[0]);
    const own = parseFloat(cs.getPropertyValue(`${prop}-opacity`)) || 1;
    if (own * rgb[1] < 1) dst.setAttribute(`${prop}-opacity`, String(own * rgb[1]));
  }
  const props =
    src.tagName === "text" || src.tagName === "tspan"
      ? [...SHAPE_PROPS, ...TEXT_PROPS]
      : SHAPE_PROPS;
  for (const prop of props) {
    const v = cs.getPropertyValue(prop).trim();
    if (v && v !== DEFAULTS[prop]) dst.setAttribute(prop, v);
  }
  dst.removeAttribute("class");
  dst.removeAttribute("style");
}

/** First non-transparent background behind the canvas (the paper colour). */
function backgroundOf(el: Element): string {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const rgb = toRgb(getComputedStyle(node).backgroundColor);
    if (rgb && rgb[1] > 0) return rgb[0];
  }
  return "rgb(255, 255, 255)";
}

let fontCss: Promise<string> | null = null;
/** Inlines the Latin subset of the app's Google font as data URLs, so text renders identically. */
function embeddedFontCss(): Promise<string> {
  fontCss ??= (async () => {
    const link = document.querySelector<HTMLLinkElement>('link[href*="fonts.googleapis.com/css"]');
    if (!link) return "";
    const css = await (await fetch(link.href)).text();
    const blocks = [...css.matchAll(/\/\*\s*latin\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)].map(
      (m) => m[1] ?? "",
    );
    const inlined = await Promise.all(
      blocks.map(async (block) => {
        const url = /url\((https:[^)]+)\)/.exec(block)?.[1];
        if (!url) return "";
        const blob = await (await fetch(url)).blob();
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        return block.replace(url, data);
      }),
    );
    return inlined.join("\n");
  })().catch(() => {
    fontCss = null; // offline: export still works, text falls back to monospace
    return "";
  });
  return fontCss;
}

export interface Snapshot {
  svg: string;
  /** Output size in CSS px (1 px = 1 diagram unit for the whole diagram). */
  width: number;
  height: number;
  /** Paper colour, or null for a transparent export. */
  background: string | null;
}
export interface SnapshotOptions {
  /** "view": exactly what is on screen; "diagram": everything, at 100% zoom. */
  area?: "view" | "diagram";
  /** Paper background and grid; off gives a transparent image. */
  background?: boolean;
}

/** Diagram parts that define the "whole diagram" area. */
const CONTENT =
  ".diagram-zone, .diagram-node, .edge-line, .edge-head, .edge-tag, .diagram-note, .note-link";
const PAD = 40;

/** Region of the canvas (CSS px, relative to the canvas) and output px per canvas px. */
export function exportRegion(canvas: SVGSVGElement, area: "view" | "diagram" = "view") {
  const rect = canvas.getBoundingClientRect();
  const view = { x: 0, y: 0, w: rect.width, h: rect.height, unit: 1 };
  if (area === "view") return view;
  const parts = [...canvas.querySelectorAll(CONTENT)].map((el) => el.getBoundingClientRect());
  if (!parts.length) return view;
  const scene = canvas.querySelector<SVGGElement>(":scope > g");
  const zoom = scene?.transform.baseVal.consolidate()?.matrix.a || 1;
  const pad = PAD * zoom;
  const x0 = Math.min(...parts.map((r) => r.left)) - rect.left - pad,
    y0 = Math.min(...parts.map((r) => r.top)) - rect.top - pad,
    x1 = Math.max(...parts.map((r) => r.right)) - rect.left + pad,
    y1 = Math.max(...parts.map((r) => r.bottom)) - rect.top + pad;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, unit: 1 / zoom };
}

/** Serialises the live canvas into a standalone SVG that looks exactly like the screen. */
export async function snapshotCanvas(
  canvas: SVGSVGElement,
  { area = "view", background = true }: SnapshotOptions = {},
): Promise<Snapshot> {
  const region = exportRegion(canvas, area);
  const width = Math.round(region.w * region.unit),
    height = Math.round(region.h * region.unit);
  const clone = canvas.cloneNode(true) as SVGSVGElement;
  // Clone and source have identical structure, so walk them in lockstep before pruning.
  const src = [canvas, ...canvas.querySelectorAll("*")];
  const dst = [clone, ...clone.querySelectorAll("*")];
  src.forEach((el, i) => {
    const copy = dst[i];
    if (!copy) return;
    // Classes are gone once baked, so decide what to drop first.
    if (getComputedStyle(el).display === "none" || el.matches(UI_ONLY))
      copy.setAttribute("data-drop", "");
    else if (!background && el.matches(".iso-grid")) copy.setAttribute("data-drop", "");
    else bakeStyle(el, copy);
  });
  clone.querySelectorAll("[data-drop]").forEach((el) => el.remove());

  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("viewBox", `${region.x} ${region.y} ${region.w} ${region.h}`);
  for (const attr of ["aria-label", "role", "fill", "stroke"]) clone.removeAttribute(attr);

  const paper = backgroundOf(canvas);
  if (background) {
    const bg = document.createElementNS(SVG_NS, "rect");
    bg.setAttribute("x", String(region.x));
    bg.setAttribute("y", String(region.y));
    bg.setAttribute("width", String(region.w));
    bg.setAttribute("height", String(region.h));
    bg.setAttribute("fill", paper);
    clone.prepend(bg);
  }

  const fonts = await embeddedFontCss();
  if (fonts) {
    const style = document.createElementNS(SVG_NS, "style");
    style.textContent = fonts;
    clone.prepend(style);
  }
  return {
    svg: new XMLSerializer().serializeToString(clone),
    width,
    height,
    background: background ? paper : null,
  };
}

/** Largest scale (≤ `scale`) whose bitmap browsers can still allocate. */
export function safeScale(width: number, height: number, scale: number) {
  return Math.min(
    scale,
    16384 / Math.max(width, height, 1),
    Math.sqrt(120_000_000 / Math.max(width * height, 1)),
  );
}

export type RasterType = "image/png" | "image/jpeg" | "image/webp";
/** Renders a snapshot to a bitmap image at `scale`× its size. */
export async function rasterize(
  { svg, width, height, background }: Snapshot,
  scale = 3,
  type: RasterType = "image/png",
  quality = 0.95,
): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not render the canvas snapshot"));
      img.src = url;
    });
    const k = safeScale(width, height, scale);
    const out = document.createElement("canvas");
    out.width = Math.round(width * k);
    out.height = Math.round(height * k);
    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable");
    // JPEG has no transparency: put paper (or white) underneath.
    if (type === "image/jpeg") {
      ctx.fillStyle = background ?? "#ffffff";
      ctx.fillRect(0, 0, out.width, out.height);
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, out.width, out.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      out.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Image encoding failed"))),
        type,
        quality,
      ),
    );
    return { blob, width: out.width, height: out.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Renders a snapshot to a PNG at `scale`× the on-screen size (crisp on any display). */
export async function snapshotToPng(snapshot: Snapshot, scale = 3): Promise<Blob> {
  return (await rasterize(snapshot, scale, "image/png")).blob;
}

/**
 * A one-page PDF holding a JPEG (no PDF library needed). The page is `pageW` × `pageH`
 * points; the image fills it.
 */
export function jpegToPdf(
  jpeg: Uint8Array,
  imgW: number,
  imgH: number,
  pageW: number,
  pageH: number,
): Blob {
  return new Blob([pdfBytes(jpeg, imgW, imgH, pageW, pageH) as BlobPart], {
    type: "application/pdf",
  });
}
/** The bytes of that PDF. */
export function pdfBytes(
  jpeg: Uint8Array,
  imgW: number,
  imgH: number,
  pageW: number,
  pageH: number,
): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (p: string | Uint8Array) => {
    const bytes = typeof p === "string" ? enc.encode(p) : p;
    parts.push(bytes);
    length += bytes.length;
  };
  const W = pageW.toFixed(2),
    H = pageH.toFixed(2);
  const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  push("%PDF-1.4\n");
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // binary marker comment
  offsets[1] = length;
  push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  offsets[2] = length;
  push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  offsets[3] = length;
  push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] ` +
      `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );
  offsets[4] = length;
  push(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  push(jpeg);
  push("\nendstream\nendobj\n");
  offsets[5] = length;
  push(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
  const xref = length;
  push(
    "xref\n0 6\n0000000000 65535 f \n" +
      offsets
        .slice(1)
        .map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)
        .join("") +
      `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The snapshot as a PDF page the size of the image (1 CSS px = 0.75 pt), sharp at `scale`×. */
export async function snapshotToPdf(snapshot: Snapshot, scale = 3): Promise<Blob> {
  const { blob, width, height } = await rasterize(snapshot, scale, "image/jpeg", 0.95);
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  return jpegToPdf(jpeg, width, height, snapshot.width * 0.75, snapshot.height * 0.75);
}
