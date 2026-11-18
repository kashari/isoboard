/**
 * Exports exactly what the canvas currently shows (same viewport, theme and colours) as a
 * self-contained SVG or a high-resolution PNG.
 *
 * Instead of shipping the app stylesheet (which depends on CSS variables, `.dark` on <html>,
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
  width: number;
  height: number;
}

/** Serialises the live canvas into a standalone SVG that looks exactly like the screen. */
export async function snapshotCanvas(canvas: SVGSVGElement): Promise<Snapshot> {
  const { width, height } = canvas.getBoundingClientRect();
  const clone = canvas.cloneNode(true) as SVGSVGElement;
  // Clone and source have identical structure, so walk them in lockstep before pruning.
  const src = [canvas, ...canvas.querySelectorAll("*")];
  const dst = [clone, ...clone.querySelectorAll("*")];
  src.forEach((el, i) => {
    const copy = dst[i];
    if (!copy) return;
    if (getComputedStyle(el).display === "none") copy.setAttribute("data-drop", "");
    else bakeStyle(el, copy);
  });
  clone.querySelectorAll(`${UI_ONLY},[data-drop]`).forEach((el) => el.remove());

  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("width", String(Math.round(width)));
  clone.setAttribute("height", String(Math.round(height)));
  clone.setAttribute("viewBox", `0 0 ${Math.round(width)} ${Math.round(height)}`);
  for (const attr of ["aria-label", "role", "fill", "stroke"]) clone.removeAttribute(attr);

  const bg = document.createElementNS(SVG_NS, "rect");
  bg.setAttribute("width", "100%");
  bg.setAttribute("height", "100%");
  bg.setAttribute("fill", backgroundOf(canvas));
  clone.prepend(bg);

  const fonts = await embeddedFontCss();
  if (fonts) {
    const style = document.createElementNS(SVG_NS, "style");
    style.textContent = fonts;
    clone.prepend(style);
  }
  return { svg: new XMLSerializer().serializeToString(clone), width, height };
}

/** Renders a snapshot to a PNG at `scale`× the on-screen size (crisp on any display). */
export async function snapshotToPng({ svg, width, height }: Snapshot, scale = 3): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not render the canvas snapshot"));
      img.src = url;
    });
    const out = document.createElement("canvas");
    out.width = Math.round(width * scale);
    out.height = Math.round(height * scale);
    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, out.width, out.height);
    return await new Promise<Blob>((resolve, reject) =>
      out.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
