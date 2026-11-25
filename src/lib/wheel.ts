// Wheel events come from mouse wheels (notched, vertical) and from trackpads / Magic Mouse
// (smooth, two-dimensional). A pinch arrives as a wheel event with ctrlKey set. The board
// zooms with a mouse wheel or a pinch and pans with a two-finger scroll.

export type WheelLike = Pick<
  WheelEvent,
  "deltaX" | "deltaY" | "deltaMode" | "ctrlKey" | "metaKey" | "shiftKey"
> & {
  wheelDeltaY?: number;
};

/** How long a pan gesture (with its momentum) keeps later events panning. */
export const PAN_GESTURE_MS = 250;

/** True when the event should pan the board rather than zoom it. `panning` = a pan event came
 *  in less than PAN_GESTURE_MS ago, so a gesture isn't split between panning and zooming. */
export function wheelPans(e: WheelLike, panning = false): boolean {
  if (e.ctrlKey || e.metaKey) return false; // pinch, or Ctrl/⌘ + wheel
  if (e.deltaX !== 0 || e.shiftKey) return true; // sideways scroll
  if (panning) return true;
  if (e.deltaMode !== 0) return false; // line/page steps: a mouse wheel
  // Chrome and Safari report a trackpad's legacy wheelDeltaY as exactly -3 × deltaY; a mouse
  // wheel's is a multiple of 120.
  if (e.wheelDeltaY) return e.wheelDeltaY === -3 * e.deltaY;
  return Math.abs(e.deltaY) < 50;
}

/** The wheel delta in screen pixels. */
export function wheelPixels(
  e: Pick<WheelEvent, "deltaX" | "deltaY" | "deltaMode" | "shiftKey">,
  page = 800,
) {
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? page : 1;
  // Shift + vertical wheel scrolls sideways (some browsers already swap the axes).
  if (e.shiftKey && e.deltaX === 0) return { x: e.deltaY * unit, y: 0 };
  return { x: e.deltaX * unit, y: e.deltaY * unit };
}
