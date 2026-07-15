import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { MarkerFlashService } from './marker-flash.service';

/**
 * MarkerFlashService stores link state in the private `_flashing` signal (linkId → color)
 * and schedules a per-link续命 timer. We assert on that signal/timer behaviour directly;
 * the DOM side-effects (`.marker-pulse` + inline stroke) require an SVG and are exercised
 * manually instead.
 */
describe('MarkerFlashService', () => {
  let service: MarkerFlashService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flashing = () => (service as any)._flashing() as ReadonlyMap<string, string | null>;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({ providers: [MarkerFlashService] });
    service = TestBed.inject(MarkerFlashService);
  });

  it('adds the link to the active set immediately on flash()', () => {
    service.flash('link-1', null);
    expect(flashing().has('link-1')).toBe(true);
  });

  it('stores the latest color on repeat flash()', () => {
    service.flash('link-1', null);
    service.flash('link-1', null);
    expect(flashing().get('link-1')).toBeNull();
  });

  describe('with fake timers', () => {
    beforeAll(() => vi.useFakeTimers());
    afterAll(() => vi.useRealTimers());

    it('expires after the default 800ms', () => {
      service.flash('link-default', null);
      vi.advanceTimersByTime(799);
      expect(flashing().has('link-default')).toBe(true);
      vi.advanceTimersByTime(2);
      expect(flashing().has('link-default')).toBe(false);
    });

    it('honors a custom durationMs (1200ms)', () => {
      service.flash('link-custom', null, 1200);
      vi.advanceTimersByTime(800);
      expect(flashing().has('link-custom')).toBe(true);
      vi.advanceTimersByTime(399);
      expect(flashing().has('link-custom')).toBe(true);
      vi.advanceTimersByTime(2);
      expect(flashing().has('link-custom')).toBe(false);
    });

    it('续命: a repeat flash within the window resets the timer', () => {
      service.flash('link-renew', null); // 800ms timer
      vi.advanceTimersByTime(500); // 300ms left on original
      service.flash('link-renew', null); // reset to a fresh 800ms
      vi.advanceTimersByTime(500); // original would have expired; reset still has 300ms
      expect(flashing().has('link-renew')).toBe(true);
      vi.advanceTimersByTime(300);
      expect(flashing().has('link-renew')).toBe(false);
    });
  });
});
