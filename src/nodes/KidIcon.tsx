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
