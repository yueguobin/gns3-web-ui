import { describe, it, expect } from 'vitest';
import {
  canvasToScreen,
  placeWindow,
  dockSlot,
  snapRect,
  ANCHOR_GAP,
  VIEWPORT_MARGIN,
  DOCK_GAP,
  DOCK_TILE_W,
  DOCK_TILE_H,
  DOCK_RIGHT_RESERVE,
  SNAP_THRESHOLD,
} from './replay-geometry';

describe('canvasToScreen', () => {
  it('applies the map transform: canvas*k + zeroZero + pan', () => {
    // Matches text-editor.component.ts:163-172.
    expect(canvasToScreen({ x: 100, y: 50 }, 2, 30, -40, { x: 500, y: 400 })).toEqual({
      x: 100 * 2 + 500 + 30,
      y: 50 * 2 + 400 - 40,
    });
  });

  it('identity at k=1 with no pan and zero origin', () => {
    expect(canvasToScreen({ x: 7, y: -3 }, 1, 0, 0, { x: 0, y: 0 })).toEqual({ x: 7, y: -3 });
  });

  it('scales about the zero-zero point (zoom on canvas center)', () => {
    const p = canvasToScreen({ x: 10, y: 10 }, 3, 0, 0, { x: 100, y: 100 });
    expect(p).toEqual({ x: 130, y: 130 });
  });
});

describe('placeWindow', () => {
  const viewport = { width: 1920, height: 1080, topOffset: 64 };
  const win = { width: 380, height: 300 };

  it('prefers the upper-right of the anchor', () => {
    const { rect, side } = placeWindow({ x: 800, y: 400 }, win, viewport);
    expect(side).toBe('right');
    expect(rect.left).toBe(800 + ANCHOR_GAP);
    expect(rect.top).toBe(400 - ANCHOR_GAP);
  });

  it('flips to the left when the right edge would overflow', () => {
    const { rect, side } = placeWindow({ x: 1800, y: 400 }, win, viewport);
    expect(side).toBe('left');
    expect(rect.left + rect.width).toBeLessThanOrEqual(1800 - ANCHOR_GAP);
    expect(rect.left).toBe(1800 - ANCHOR_GAP - win.width);
  });

  it('clamps below the toolbar and above the viewport bottom', () => {
    const top = placeWindow({ x: 800, y: 10 }, win, viewport).rect.top;
    expect(top).toBe(viewport.topOffset + VIEWPORT_MARGIN);

    const bottom = placeWindow({ x: 800, y: 1070 }, win, viewport).rect.top;
    expect(bottom).toBe(viewport.height - win.height - VIEWPORT_MARGIN);
  });

  it('clamps a flipped window that overflows the left edge', () => {
    // Narrow viewport so the flip still cannot fit; clamping wins over the flip.
    const narrow = { width: 400, height: 1080, topOffset: 64 };
    const { rect, side } = placeWindow({ x: 380, y: 400 }, win, narrow);
    expect(side).toBe('left');
    expect(rect.left).toBe(VIEWPORT_MARGIN);
  });

  it('a window taller than the viewport pins to the toolbar', () => {
    const { rect } = placeWindow({ x: 800, y: 500 }, { width: 380, height: 2000 }, viewport);
    expect(rect.top).toBe(viewport.topOffset + VIEWPORT_MARGIN);
  });
});

describe('dockSlot (pinned comparison row)', () => {
  const wide = { width: 1920, height: 1080 };

  it('a single pin docks at the bottom-left with the target tile size', () => {
    const s = dockSlot(0, 1, wide);
    expect(s).toMatchObject({ left: VIEWPORT_MARGIN, top: wide.height - VIEWPORT_MARGIN - DOCK_TILE_H });
    expect(s.width).toBe(DOCK_TILE_W);
    expect(s.height).toBe(DOCK_TILE_H);
  });

  it('pins flow left→right along the bottom, never overlapping', () => {
    const n = 3;
    const slots = Array.from({ length: n }, (_, i) => dockSlot(i, n, wide));
    for (let i = 1; i < n; i++) {
      expect(slots[i].top).toBe(slots[0].top); // same bottom row
      expect(slots[i].left).toBe(slots[i - 1].left + slots[i - 1].width + DOCK_GAP);
    }
    expect(slots[2].left + slots[2].width).toBeLessThanOrEqual(wide.width - DOCK_RIGHT_RESERVE);
  });

  it('overflowing pins wrap UPWARD to a second row', () => {
    // 1920 - 296 reserve → 3 columns of 440; 4 pins → row 2 above the first.
    const bottom = dockSlot(2, 4, wide);
    const above = dockSlot(3, 4, wide);
    expect(above.top).toBe(bottom.top - bottom.height - DOCK_GAP);
    expect(above.left).toBe(VIEWPORT_MARGIN); // wraps to the row's first column
  });

  it('keeps full-size tiles when they fit: two pins share one row at 1280', () => {
    const vp = { width: 1280, height: 800 };
    const slots = Array.from({ length: 2 }, (_, i) => dockSlot(i, 2, vp));
    expect(slots[1].top).toBe(slots[0].top); // one row — no wrap, no shrink
    expect(slots[0].width).toBe(DOCK_TILE_W);
    expect(slots[1].left + slots[1].width).toBeLessThanOrEqual(vp.width - DOCK_RIGHT_RESERVE);
  });

  it('height compresses when many rows would rise past the toolbar', () => {
    const vp = { width: 900, height: 500 }; // 1 column → 4 pins = 4 rows
    const s = dockSlot(0, 4, vp);
    expect(s.height).toBeLessThan(DOCK_TILE_H);
    expect(s.top).toBeGreaterThanOrEqual(80); // never above the toolbar zone
  });

  it('narrow viewports use the full width (no replay-panel reserve)', () => {
    const vp = { width: 700, height: 800 };
    const s = dockSlot(0, 1, vp);
    expect(s.left).toBe(VIEWPORT_MARGIN);
    expect(s.left + s.width).toBeLessThanOrEqual(vp.width - VIEWPORT_MARGIN);
  });
});

describe('snapRect (magnetic drag snap)', () => {
  const sibling = { left: 200, top: 300, width: 440, height: 320 };
  const mine = { width: 440, height: 320 };

  it('attaches flush when my left lands near the sibling’s right edge', () => {
    // Dragged to left 646+10 — within threshold of sibling.right (640).
    const r = snapRect({ left: 650, top: 100, ...mine }, [sibling]);
    expect(r.left).toBe(640); // sibling.left + sibling.width
    expect(r.top).toBe(100); // nothing near vertically
  });

  it('attaches me on the sibling’s left when my right edge approaches it', () => {
    const rightSibling = { left: 700, top: 300, width: 440, height: 320 };
    // Dragged to left 265 → my right edge is 705, 5px past the sibling's 700.
    const r = snapRect({ left: 265, top: 100, ...mine }, [rightSibling]);
    expect(r.left).toBe(260); // sibling.left - my width → right edges flush at 700
  });

  it('aligns tops across rows (columns without perpendicular overlap)', () => {
    const r = snapRect({ left: 800, top: 308, ...mine }, [sibling]);
    expect(r.left).toBe(800); // far away horizontally — no x snap
    expect(r.top).toBe(300); // aligned to the sibling's top
  });

  it('does nothing beyond the threshold', () => {
    const r = snapRect({ left: sibling.left + SNAP_THRESHOLD + 1, top: 999, ...mine }, [sibling]);
    expect(r.left).toBe(sibling.left + SNAP_THRESHOLD + 1);
    expect(r.top).toBe(999);
  });

  it('the nearest candidate per axis wins across several siblings', () => {
    const near = { left: 505, top: 300, width: 100, height: 100 };
    const r = snapRect({ left: 500, top: 306, ...mine }, [sibling, near]);
    expect(r.left).toBe(505); // |505-500|=5 beats sibling's |200-500|
    expect(r.top).toBe(300); // both siblings offer top 300
  });

  it('size passes through untouched', () => {
    const r = snapRect({ left: 0, top: 0, width: 777, height: 111 }, []);
    expect(r).toEqual({ left: 0, top: 0, width: 777, height: 111 });
  });
});
