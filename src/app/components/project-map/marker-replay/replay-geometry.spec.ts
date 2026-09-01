import { describe, it, expect } from 'vitest';
import { canvasToScreen, placeWindow, ANCHOR_GAP, VIEWPORT_MARGIN } from './replay-geometry';

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
