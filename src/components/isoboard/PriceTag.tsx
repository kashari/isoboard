import type React from "react";
import { tagShape, TAG_PIN, type TagInfo } from "@/lib/tags";

interface Props {
  tag: TagInfo;
  className?: string;
  onPointerDown?: (e: React.PointerEvent<SVGGElement>) => void;
  onDoubleClick?: (e: React.MouseEvent<SVGGElement>) => void;
  /** Starts a resize from the bottom-right grip; gets the card's current width. */
  onResizeStart?: ((e: React.PointerEvent<SVGGElement>, width: number) => void) | undefined;
}

/** A note card hung from its block by a string, like a price tag. Drawn in block coords. */
export function PriceTag({
  tag,
  className = "",
  onPointerDown,
  onDoubleClick,
  onResizeStart,
}: Props) {
  const s = tagShape(tag);
  return (
    <g className={`price-tag tag-${tag.color} ${className}`}>
      <path className="tag-string" d={s.string} />
      <g
        className="tag-card"
        transform={`translate(${tag.at.x} ${tag.at.y})`}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
      >
        <title>Drag to move · double-click to edit</title>
        <g className="tag-swing" transform={`rotate(${s.tilt})`}>
          <path className="tag-loop" d={s.loop} />
          <path className="tag-shadow" d={s.body} fillRule="evenodd" transform="translate(4 6)" />
          <path className="tag-body" d={s.body} fillRule="evenodd" />
          <path className="tag-stitch" d={s.stitch} />
          {s.rule && <path className="tag-rule" d={s.rule} />}
          <path className="tag-ring" d={s.ring} fillRule="evenodd" />
          {s.text.map((t, i) => (
            <text key={i} className={t.head ? "tag-head" : "tag-small"} x={t.x} y={t.y}>
              {t.s}
            </text>
          ))}
          {onResizeStart && (
            <g
              className="tag-resize"
              transform={`translate(${s.width / 2 - 3} ${s.bottom - 3})`}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResizeStart(e, s.width);
              }}
            >
              <title>Drag to resize</title>
              <rect className="tag-resize-hit" x="-22" y="-22" width="30" height="30" />
              <path d="M -15 -3 L -3 -15 M -9 -3 L -3 -9" />
            </g>
          )}
        </g>
      </g>
      <circle className="tag-pin" cx={TAG_PIN.x} cy={TAG_PIN.y} r="5.5" />
      <circle className="tag-pin-shine" cx={TAG_PIN.x - 1.7} cy={TAG_PIN.y - 1.8} r="1.7" />
    </g>
  );
}
