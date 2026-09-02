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

// ---- pinned-window dock ---------------------------------------------------

/** Default dock tile size — the user's last manual resize overrides it. */
export const DOCK_TILE_W = 440;
export const DOCK_TILE_H = 360;
/** Gap between dock tiles and rows. */
export const DOCK_GAP = 12;
/** Right reserve so tiles don't slide under the docked replay panel. */
export const DOCK_RIGHT_RESERVE = 296;
/** Bottom dock never rises above the project toolbar (+ margin). */
const DOCK_TOP_LIMIT = 80;

export interface DockSlot {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Uniform slot for pinned comparison window `index` of `count`: a
 * bottom-anchored flow that fills left→right and wraps UPWARD, in pin order —
 * the deterministic "comparison row" (vs. the live window, which anchors
 * beside its link). While docked the slot owns BOTH position and size;
 * dragging or resizing a window frees it (`reanchor()` re-docks it).
 *
 * `target` is the desired tile size — the session's remembered user size when
 * one exists (the last manual resize), else the {@link DOCK_TILE_W}/
 * {@link DOCK_TILE_H} defaults; rows/columns still compress it to fit.
 */
export function dockSlot(
  index: number,
  count: number,
  viewport: { width: number; height: number },
  target: { width: number; height: number } = { width: DOCK_TILE_W, height: DOCK_TILE_H }
): DockSlot {
  const left0 = VIEWPORT_MARGIN;
  // The replay panel (right-docked, ~280px) is only reserved once the viewport
  // is wide enough for it to matter — narrow screens use the full width.
  const right =
    viewport.width > DOCK_RIGHT_RESERVE + DOCK_TILE_W + VIEWPORT_MARGIN
      ? viewport.width - DOCK_RIGHT_RESERVE
      : viewport.width - VIEWPORT_MARGIN;
  const usableW = Math.max(DOCK_GAP, right - left0);
  const cols = Math.max(1, Math.floor((usableW + DOCK_GAP) / (target.width + DOCK_GAP)));
  const width = Math.max(200, Math.min(target.width, Math.floor((usableW - (cols - 1) * DOCK_GAP) / cols)));

  const rows = Math.max(1, Math.ceil(count / cols));
  const usableH = Math.max(DOCK_GAP, viewport.height - VIEWPORT_MARGIN - DOCK_TOP_LIMIT);
  const height = Math.max(160, Math.min(target.height, Math.floor((usableH - (rows - 1) * DOCK_GAP) / rows)));

  const col = index % cols;
  const row = Math.floor(index / cols); // row 0 = bottom
  return {
    left: left0 + col * (width + DOCK_GAP),
    top: viewport.height - VIEWPORT_MARGIN - height - row * (height + DOCK_GAP),
    width,
    height,
  };
}

// ---- magnetic snap (dragging pinned windows) ------------------------------

/** Snap distance in px — a dragged edge within this of a sibling's attaches. */
export const SNAP_THRESHOLD = 12;

/**
 * Magnetic snap of a dragged pinned window against its settled siblings'
 * rects: within {@link SNAP_THRESHOLD} an edge attaches flush (side-by-side)
 * or aligns (column/row), per axis independently — the nearest candidate per
 * axis wins, so dragging two windows together builds flush comparison grids.
 * No perpendicular-overlap requirement: aligning to a window in another row is
 * exactly how tidy columns get built.
 */
export function snapRect(tentative: Rect, siblings: Rect[], threshold: number = SNAP_THRESHOLD): Rect {
  let left = tentative.left;
  let top = tentative.top;
  let bestX = threshold + 1;
  let bestY = threshold + 1;
  for (const s of siblings) {
    // My LEFT may attach to: the sibling's left (align), its right edge
    // (I sit on its right), or its left minus my width (I sit on its left).
    for (const cx of [s.left, s.left + s.width, s.left - tentative.width]) {
      const d = Math.abs(cx - tentative.left);
      if (d < bestX) {
        bestX = d;
        left = cx;
      }
    }
    for (const cy of [s.top, s.top + s.height, s.top - tentative.height]) {
      const d = Math.abs(cy - tentative.top);
      if (d < bestY) {
        bestY = d;
        top = cy;
      }
    }
  }
  return { left, top, width: tentative.width, height: tentative.height };
}
