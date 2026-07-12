import { Injectable, OnDestroy, signal, effect, EffectRef, DestroyRef, inject } from '@angular/core';
import { select } from 'd3-selection';

/**
 * Flashes a link when its marker matches live traffic.
 *
 * State is a signal of `linkId → color`. On each `flash(linkId, color)`:
 *   - the entry is (re)added to the map with the latest color
 *   - a 100ms timer is (re)set for that linkId (debounce-style续命)
 *
 * An `effect()` diffs the new map against the previous one and mutates ONLY the
 * changed link's DOM — add/keep → apply color + `.marker-pulse`; remove → clear.
 * So no matter how large the topology, a single flash touches exactly one path.
 *
 * Color comes from the caller (resolved as `marker.color ?? null`). `null` means
 * "use the default theme color" (handled in CSS via the class, no inline color).
 */
@Injectable()
export class MarkerFlashService implements OnDestroy {
  /** linkId → color (hex) or null (use default theme color). */
  private readonly _flashing = signal<ReadonlyMap<string, string | null>>(new Map());
  /** Per-link debounce timers (续命). */
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly FLASH_MS = 100;
  private readonly effectRef: EffectRef;
  /** Previous snapshot for diffing. */
  private prev = new Map<string, string | null>();

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.effectRef = effect(() => this.applyDiff(this._flashing()));
    destroyRef.onDestroy(() => {
      this.effectRef.destroy();
      for (const id of [...this.prev.keys()]) this.clearLink(id);
      this.prev.clear();
      for (const t of this.timers.values()) clearTimeout(t);
      this.timers.clear();
    });
  }

  /**
   * Flash a link. Repeated calls within FLASH_ms keep it lit (timer续命).
   * @param color resolved marker color (hex), or null to use the default theme color.
   */
  flash(linkId: string, color: string | null) {
    this._flashing.update((m) => {
      const next = new Map(m);
      next.set(linkId, color);
      return next;
    });
    clearTimeout(this.timers.get(linkId));
    this.timers.set(
      linkId,
      setTimeout(() => this.expire(linkId), this.FLASH_MS)
    );
  }

  private expire(linkId: string) {
    this.timers.delete(linkId);
    this._flashing.update((m) => {
      if (!m.has(linkId)) return m;
      const next = new Map(m);
      next.delete(linkId);
      return next;
    });
  }

  /** Diff old vs new and touch only changed links. */
  private applyDiff(curr: ReadonlyMap<string, string | null>) {
    // Removed → clear.
    for (const id of [...this.prev.keys()]) {
      if (!curr.has(id)) {
        this.clearLink(id);
        this.prev.delete(id);
      }
    }
    // Added or color changed → set.
    for (const [id, color] of curr) {
      if (this.prev.get(id) !== color) {
        this.setLink(id, color);
        this.prev.set(id, color);
      }
    }
  }

  private setLink(id: string, color: string | null) {
    const sel = this.selectLinkPath(id);
    if (sel.empty()) return;
    sel.classed('marker-pulse', true);
    // null → remove inline color so CSS default (var(--mat-sys-primary)) applies.
    sel.style('stroke', color ?? null);
  }

  private clearLink(id: string) {
    const sel = this.selectLinkPath(id);
    if (sel.empty()) return;
    sel.classed('marker-pulse', false).style('stroke', null);
  }

  private selectLinkPath(id: string) {
    return select('svg#map')
      .select(`g.link[link_id="${id}"]`)
      .select('path.ethernet_link, path.serial_link');
  }

  ngOnDestroy() {}
}
