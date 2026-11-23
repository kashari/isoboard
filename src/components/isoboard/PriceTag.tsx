import type React from "react";
import { tagShape, TAG_PIN, type TagInfo } from "@/lib/tags";

interface Props {
  tag: TagInfo;
  className?: string;
  onPointerDown?: (e: React.PointerEvent<SVGGElement>) => void;
  onDoubleClick?: (e: React.MouseEvent<SVGGElement>) => void;
}

/** A paper price tag hung from its block by a string. Drawn in the block's coordinates. */
export function PriceTag({ tag, className = "", onPointerDown, onDoubleClick }: Props) {
  const { lines, color, at } = tag;
  const s = tagShape(lines, at);
  return (
    <g className={`price-tag tag-${color} ${className}`}>
      <path className="tag-string" d={s.string} />
      <g
        className="tag-card"
        transform={`translate(${at.x} ${at.y})`}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
      >
        <title>Drag to move · double-click to edit</title>
        <g className="tag-swing" transform={`rotate(${s.tilt})`}>
          <g transform={`scale(${s.side} 1)`}>
            <path className="tag-loop" d={s.loop} />
            <path className="tag-shadow" d={s.body} transform="translate(2.5 3.5)" />
            <path className="tag-body" d={s.body} fillRule="evenodd" />
            <path className="tag-stitch" d={s.stitch} />
            <path className="tag-ring" d={s.ring} fillRule="evenodd" />
          </g>
          {s.text.map((t, i) => (
            <text key={i} className={t.head ? "tag-head" : "tag-small"} x={t.x} y={t.y}>
              {t.s}
            </text>
          ))}
        </g>
      </g>
      <circle className="tag-pin" cx={TAG_PIN.x} cy={TAG_PIN.y} r="4.6" />
      <circle className="tag-pin-shine" cx={TAG_PIN.x - 1.4} cy={TAG_PIN.y - 1.5} r="1.4" />
    </g>
  );
}
