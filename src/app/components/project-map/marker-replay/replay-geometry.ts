/**
 * Pure geometry for the replay detail window: canvas→screen conversion and
 * viewport-aware window placement. No Angular, no DOM — directly testable in
 * jsdom (the live component wraps these with d3 path queries).
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Gap between the anchor point and the window's near edge. */
export const ANCHOR_GAP = 28;
/** Viewport margin kept clear on every side. */
export const VIEWPORT_MARGIN = 16;

/**
 * Canvas coordinates → viewport (screen) coordinates, using the exact map
 * formula (cf. text-editor.component.ts): the canvas group is transformed by
 * `translate(zeroZero + pan) scale(k)`, so a canvas point lands at
 * `canvas * k + zeroZero + pan`.
 */
export function canvasToScreen(
  p: Point,
  k: number,
  panX: number,
  panY: number,
  zeroZero: Point
): Point {
  return {
    x: p.x * k + zeroZero.x + panX,
    y: p.y * k + zeroZero.y + panY,
  };
}

export interface WindowPlacement {
  rect: Rect;
  /** Which window edge faces the anchor (leader-line attachment side). */
  side: 'left' | 'right';
}

/**
 * Place the detail window beside its anchor (the link midpoint, screen space).
 *
 * Preference is upper-right of the anchor; when the window would overflow the
 * right viewport edge it flips to the left side. Top/bottom are clamped below
 * the project toolbar (`topOffset`) and above the viewport bottom. On very
 * small viewports the clamps may let the window cover the anchor — positioning
 * correctness wins over overlap avoidance there.
 */
export function placeWindow(
  anchor: Point,
  win: { width: number; height: number },
  viewport: { width: number; height: number; topOffset: number }
): WindowPlacement {
  let left = anchor.x + ANCHOR_GAP;
  let side: 'left' | 'right' = 'right';
  if (left + win.width > viewport.width - VIEWPORT_MARGIN) {
    side = 'left';
    left = anchor.x - ANCHOR_GAP - win.width;
  }
  // Horizontal clamp (after the flip, a wide window may overflow the left too).
  const minLeft = VIEWPORT_MARGIN;
  const maxLeft = Math.max(minLeft, viewport.width - win.width - VIEWPORT_MARGIN);
  left = Math.max(minLeft, Math.min(maxLeft, left));

  const minTop = viewport.topOffset + VIEWPORT_MARGIN;
  const maxTop = Math.max(minTop, viewport.height - win.height - VIEWPORT_MARGIN);
  const top = Math.max(minTop, Math.min(maxTop, anchor.y - ANCHOR_GAP));

  return { rect: { left, top, width: win.width, height: win.height }, side };
}
