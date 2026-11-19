import { icons, type LucideIcon } from "lucide-react";

/**
 * Chunky, storybook-style icons. Glyphs are drawn in a 24×24 box on a round paper "sticker".
 * A few common icons get hand-made, coloured glyphs; everything else falls back to a heavy
 * lucide line icon so every icon in the picker keeps working.
 */
function Glyph({ name }: { name: string }) {
  switch (name) {
    case "Server":
      return (
        <>
          <rect className="g-paper" x="6" y="6.4" width="12" height="4.8" rx="1.6" />
          <rect className="g-paper" x="6" y="12.8" width="12" height="4.8" rx="1.6" />
          <circle className="g-mint" cx="8.7" cy="8.8" r="1" />
          <circle className="g-mint" cx="8.7" cy="15.2" r="1" />
          <path d="M 11.6 8.8 H 15.4 M 11.6 15.2 H 15.4" />
        </>
      );
    case "Globe":
      return (
        <>
          <circle className="g-blue" cx="12" cy="12" r="6.6" />
          <path
            className="g-mint"
            d="M 8 9.8 C 9.2 8 11.6 7.8 12.4 9.2 C 13 10.6 11.2 11.8 9.8 12 C 8.6 12.1 7.6 11 8 9.8 Z"
          />
          <path
            className="g-mint"
            d="M 13.4 13.6 C 14.6 12.6 16.6 13 16.8 14.4 C 16.4 16.2 14.6 16.8 13.6 16 C 13 15.4 13 14.2 13.4 13.6 Z"
          />
        </>
      );
    case "Database":
      return (
        <>
          <path className="g-paper" d="M 6.5 8 V 16 A 5.5 2.2 0 0 0 17.5 16 V 8" />
          <path d="M 6.5 12 A 5.5 2.2 0 0 0 17.5 12" />
          <ellipse className="g-paper" cx="12" cy="8" rx="5.5" ry="2.2" />
        </>
      );
    // Tech-stack stickers: simple, friendly marks in the same chunky style (not logos).
    case "Spring":
      return (
        <>
          <path
            className="g-green"
            d="M 6.6 17.4 C 5.8 10.6 10.4 6.2 17.6 6.4 C 18 13.4 13.6 17.9 6.6 17.4 Z"
          />
          <path d="M 7.8 16.2 C 10 13.4 12.4 11.4 15 9.4" />
        </>
      );
    case "Postgres":
      // A friendly elephant in profile: big ear, round head, curled trunk.
      return (
        <>
          <ellipse className="g-blue" cx="9.2" cy="11.6" rx="3.6" ry="4.6" />
          <path
            className="g-blue"
            d="M 15.6 12.8 C 17 14.6 16.8 17.2 15.2 18.6 C 14.7 19 15.3 19.8 15.9 19.4 C 18.2 17.8 18.6 14.4 17.2 12 Z"
          />
          <circle className="g-blue" cx="13.6" cy="10.4" r="4.6" />
          <path d="M 9.6 9.6 C 10.4 10.8 10.4 12.6 9.6 13.8" />
          <circle className="g-ink" cx="14.8" cy="9.4" r="0.95" />
          <path className="g-paper" d="M 16.6 13.6 L 18.6 14.8 L 16.9 14.9 Z" />
        </>
      );
    case "Oracle":
      return (
        <>
          <rect className="g-red" x="4.8" y="7.6" width="14.4" height="8.8" rx="4.4" />
          <rect className="g-paper" x="7.8" y="10.1" width="8.4" height="3.8" rx="1.9" />
        </>
      );
    case "Dolphin":
      return (
        <>
          <path
            className="g-blue"
            d="M 5.2 16.6 C 6.4 10.6 11.4 7 17.8 8.2 C 16.6 8.8 15.8 9.8 15.6 11 C 17 11.6 18.2 12.8 18.6 14.4 C 17 13.6 15.4 13.4 14 13.8 C 11.6 14.4 9.6 15.8 8.4 18 C 8 17 7.6 16.6 5.2 16.6 Z"
          />
          <circle className="g-ink" cx="14.2" cy="10.4" r="0.8" />
        </>
      );
    case "Leaf":
      return (
        <>
          <path
            className="g-green"
            d="M 12 4.6 C 16.6 8.6 16.8 14.2 12.2 18.4 C 7.4 14.4 7.4 8.8 12 4.6 Z"
          />
          <path d="M 12 7.6 V 20" />
        </>
      );
    case "Redis":
      return (
        <>
          <path className="g-red" d="M 5.6 14.4 L 12 17.6 L 18.4 14.4 L 12 11.2 Z" />
          <path className="g-red" d="M 5.6 11.6 L 12 14.8 L 18.4 11.6 L 12 8.4 Z" />
          <path className="g-red" d="M 5.6 8.8 L 12 12 L 18.4 8.8 L 12 5.6 Z" />
          <path className="g-paper" d="M 10.2 8.8 L 12 7.9 L 13.8 8.8 L 12 9.7 Z" />
        </>
      );
    case "Kafka":
      return (
        <>
          <path d="M 12 12 L 12 6.8 M 12 12 L 16.6 15 M 12 12 L 7.4 15" />
          <circle className="g-ink" cx="12" cy="12" r="2.4" />
          <circle className="g-paper" cx="12" cy="6.2" r="1.9" />
          <circle className="g-paper" cx="17" cy="15.4" r="1.9" />
          <circle className="g-paper" cx="7" cy="15.4" r="1.9" />
        </>
      );
    case "Rabbit":
      return (
        <>
          <path
            className="g-amber"
            d="M 9.4 11 L 8.2 5.8 C 7.9 4.5 10 4.1 10.4 5.4 L 11.4 10.2 Z"
          />
          <path
            className="g-amber"
            d="M 12.6 10.2 L 13.8 5.4 C 14.2 4.1 16.3 4.6 15.9 5.9 L 14.6 11 Z"
          />
          <circle className="g-amber" cx="12" cy="14.4" r="4.6" />
          <circle className="g-ink" cx="10.3" cy="13.8" r="0.8" />
          <circle className="g-ink" cx="13.7" cy="13.8" r="0.8" />
        </>
      );
    case "Elastic":
      return (
        <>
          <path className="g-amber" d="M 6 9.5 A 6.5 6.5 0 0 1 18 9.5 Z" />
          <path
            className="g-paper"
            d="M 6 9.5 H 18 A 6.5 6.5 0 0 1 18 14.5 H 6 A 6.5 6.5 0 0 1 6 9.5 Z"
          />
          <path className="g-mint" d="M 6 14.5 A 6.5 6.5 0 0 0 18 14.5 Z" />
        </>
      );
    case "Helm":
      return (
        <>
          <path
            className="g-blue"
            d="M 12 4.8 L 17.6 7.5 L 19 13.6 L 15.1 18.5 L 8.9 18.5 L 5 13.6 L 6.4 7.5 Z"
          />
          <circle className="g-paper" cx="12" cy="12.4" r="3.4" />
          <path d="M 12 7.2 V 9 M 12 15.8 V 17.6 M 7 12.4 H 8.6 M 15.4 12.4 H 17" />
          <circle className="g-ink" cx="12" cy="12.4" r="1" />
        </>
      );
    case "Whale":
      return (
        <>
          <path
            className="g-blue"
            d="M 4.8 12.6 H 17.2 C 18.4 12.6 19 11.6 19.6 11 C 19.8 12.2 19.4 13 19 13.4 C 18.2 17 14.8 18.6 11 18.4 C 7.6 18.2 5.2 16 4.8 12.6 Z"
          />
          <rect className="g-paper" x="6.4" y="9.6" width="2.6" height="2.6" />
          <rect className="g-paper" x="9.4" y="9.6" width="2.6" height="2.6" />
          <rect className="g-paper" x="12.4" y="9.6" width="2.6" height="2.6" />
          <rect className="g-paper" x="9.4" y="6.6" width="2.6" height="2.6" />
          <circle className="g-ink" cx="8" cy="15" r="0.8" />
        </>
      );
    case "Nginx":
      return (
        <>
          <path className="g-green" d="M 12 4.6 L 18.4 8.3 V 15.7 L 12 19.4 L 5.6 15.7 V 8.3 Z" />
          <path className="g-paper-line" d="M 9.7 15 V 9 L 14.3 15 V 9" />
        </>
      );
    default: {
      const Icon: LucideIcon = icons[name as keyof typeof icons] ?? icons.Box;
      return <Icon x={4.6} y={4.6} width={14.8} height={14.8} className="g-line" />;
    }
  }
}

/** Upright icon for UI chrome (inspector, command palette). */
export function NodeIcon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg viewBox="2 2 20 20" width={size} height={size} className="kid-icon kid-icon-ui">
      <Glyph name={name} />
    </svg>
  );
}

/** An item's glyph centred at (x, y) inside an SVG scene, e.g. on a connector tag. */
export function GlyphAt({
  name,
  x,
  y,
  size,
}: {
  name: string;
  x: number;
  y: number;
  size: number;
}) {
  return (
    <svg
      x={x - size / 2}
      y={y - size / 2}
      width={size}
      height={size}
      viewBox="2 2 20 20"
      overflow="visible"
      className="kid-icon kid-icon-ui"
    >
      <Glyph name={name} />
    </svg>
  );
}

/**
 * Icon shown as an upright round sticker sitting on a block's top face, centred at (cx, cy).
 * Upright keeps the chunky glyphs readable; `scale` is relative to the 24px icon box.
 */
export function FaceIcon({
  name,
  cx,
  cy,
  scale = 1.4,
}: {
  name: string;
  cx: number;
  cy: number;
  scale?: number;
}) {
  const k = scale * 0.78;
  return (
    <g className="kid-icon" transform={`translate(${cx} ${cy - 4}) scale(${k})`}>
      <g transform="translate(-12 -12)">
        <ellipse className="sticker-shadow" cx="13" cy="13.8" rx="10.5" ry="10.5" />
        <circle className="sticker" cx="12" cy="12" r="10.5" />
        <Glyph name={name} />
      </g>
    </g>
  );
}

/** A friendly little person standing on a round base, used for the User node. */
export function UserFigure() {
  return (
    <g className="kid-user">
      <ellipse className="face-left" cy="9" rx="36" ry="18" />
      <ellipse className="face-top" cy="3" rx="36" ry="18" />
      <path
        className="face-top"
        d="M -17 0 C -19 -22 -12 -30 0 -30 C 12 -30 19 -22 17 0 C 8 6 -8 6 -17 0 Z"
      />
      <path className="kid-line" d="M -6 -30 L 0 -24 L 6 -30" />
      <circle className="kid-skin" cy="-46" r="15" />
      <path
        className="kid-hair"
        d="M -15.5 -47 C -16.5 -62 -2 -66 8 -61.5 C 14 -58.5 16.5 -52.5 15.5 -46 C 10 -52 2 -55 -6 -51.5 C -10 -49.5 -13 -48.2 -15.5 -47 Z"
      />
      <circle className="kid-cheek" cx="-9" cy="-40" r="2.6" />
      <circle className="kid-cheek" cx="9" cy="-40" r="2.6" />
      <circle className="kid-eye" cx="-5" cy="-45" r="1.9" />
      <circle className="kid-eye" cx="5" cy="-45" r="1.9" />
      <path className="kid-line" d="M -4.5 -39 Q 0 -35.5 4.5 -39" />
    </g>
  );
}
