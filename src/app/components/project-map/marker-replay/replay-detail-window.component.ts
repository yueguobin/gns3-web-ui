import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription } from 'rxjs';
import { select } from 'd3-selection';
import { ResizeEvent, ResizableDirective, ResizeHandleDirective } from 'angular-resizable-element';

import { MarkerReplayService, sameReplayFrame } from '@services/marker-replay.service';
import { MapScaleService } from '@services/mapScale.service';
import { MapSettingsService } from '@services/mapsettings.service';
import { LinksDataSource } from '../../../cartography/datasources/links-datasource';
import { NodesDataSource } from '../../../cartography/datasources/nodes-datasource';
import { PinnedDetail } from '@models/marker-replay';
import { formatDelta, formatFrameTime } from './replay-timeline-math';
import { placeWindow } from './replay-geometry';
import { ProtocolTreeComponent } from './protocol-tree.component';

/** Leader-line endpoint pair in viewport px (window edge → link anchor). */
interface Leader {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * A frame's detail window, ANCHORED next to its source link — instantiated
 * twice over:
 *  - LIVE (no {@link pinned} input): follows the timeline cursor
 *    (`svc.currentFrame()`), plus a 📌 button that freezes the current frame
 *    into a pinned snapshot;
 *  - PINNED ({@link pinned} set): a frozen comparison snapshot (Wireshark's
 *    "open packet in a new window") anchored to ITS frame's link, showing the
 *    cross-window diff ({@link changedPaths}) — pin one frame per hop and the
 *    windows line up along the packet's path on the map.
 *
 * Both modes:
 *  - a leader line (screen-space SVG overlay) ties the window to the link —
 *    a plain "this window describes this link" callout with a DOT at the link
 *    end, deliberately NOT an arrowhead (must not read as a traffic direction);
 *  - the window repositions on map pan/zoom/redraw.
 *
 * Reposition triggers: a MutationObserver on `g.canvas`'s transform attribute
 * (pan rewrites it without emitting ANY event — the zoom directive at least
 * bumps MapScaleService), plus `MapScaleService.scaleChangeEmitter` (toolbar
 * zoom), `MapSettingsService.mapRenderedEmitter` (node drags / data redraws)
 * and window resize — all funnelled into ONE rAF-coalesced reposition pass.
 *
 * The anchor uses the link path's bounding-box CENTER in viewport coordinates
 * (`getBoundingClientRect`), so every map transform — including the parallel-
 * link bundle translate — is already applied by the browser.
 *
 * SIZING: the user drag-resizes the window (mwlResizable, the same chrome as
 * marker-manager); the anchoring engine stays authoritative for POSITION —
 * after a resize the window is re-placed (possibly flipped to the link's other
 * side) with its new size. Position is computed, size is yours.
 */
@Component({
  selector: 'app-replay-detail-window',
  templateUrl: './replay-detail-window.component.html',
  styleUrl: './replay-detail-window.component.scss',
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    ProtocolTreeComponent,
    ResizableDirective,
    ResizeHandleDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReplayDetailWindowComponent implements OnInit, OnDestroy {
  readonly zIndex = input(1000);
  /** Focus stacking boost from the overlay's click-to-front counter. */
  readonly zBoost = input(0);
  /** Set → PINNED mode: the window freezes this snapshot instead of the cursor. */
  readonly pinned = input<PinnedDetail | null>(null);
  /** Cross-window diff paths (pinned mode; null on the live window). */
  readonly changedPaths = input<ReadonlySet<string> | null>(null);
  /** Cascade offset while no anchor has resolved (pinned windows stack visibly). */
  readonly offsetIndex = input(0);
  /** Any mousedown inside the window — the overlay raises it above its siblings. */
  readonly windowFocused = output<void>();

  readonly svc = inject(MarkerReplayService);
  private readonly mapScale = inject(MapScaleService);
  private readonly mapSettings = inject(MapSettingsService);
  private readonly linksDataSource = inject(LinksDataSource);
  private readonly nodesDataSource = inject(NodesDataSource);

  readonly DEFAULT_W = 440;
  readonly DEFAULT_H = 420;
  readonly MIN_W = 320;
  readonly MIN_H = 220;
  /** Fallback position while no anchor has ever resolved (top-right, below toolbar). */
  private readonly FALLBACK = { left: 0, top: 80 };

  /** User-owned window size (drag-resize); placement consumes both. */
  readonly winWidth = signal(this.DEFAULT_W);
  readonly winHeight = signal(this.DEFAULT_H);
  readonly winLeft = signal(this.FALLBACK.left);
  readonly winTop = signal(this.FALLBACK.top);
  /**
   * True once the user has DRAGGED the window: it leaves auto-anchor mode and
   * stays at the dropped spot (clamped to the viewport) while the leader line
   * keeps tracking the link. `reanchor()` snaps back to placed mode. (Distinct
   * from the {@link pinned} INPUT — a frozen comparison snapshot.)
   */
  readonly dragPinned = signal(false);
  /** True while a header drag gesture is in flight. */
  readonly dragging = signal(false);
  /** False when the frame's link is not on the map (deleted) or geometry failed. */
  readonly anchored = signal(false);
  /** Leader line geometry; null while unanchored. */
  readonly leader = signal<Leader | null>(null);
  /** True while a resize gesture is in flight (suppresses anchor re-placement). */
  readonly resizing = signal(false);

  /** Type-narrowed views of the detail state for the template. */
  readonly isLive = computed(() => this.pinned() === null);
  /** The frame this window describes: its own snapshot, or the cursor's. */
  readonly activeFrame = computed(() => this.pinned()?.frame ?? this.svc.currentFrame());
  /** Own detail lifecycle in pinned mode; the shared one when live. */
  readonly detailState = computed(() => this.pinned()?.state ?? this.svc.detail());
  /** Live-window 📌 state: disabled once this exact frame is already pinned. */
  readonly alreadyPinned = computed(() => {
    const frame = this.activeFrame();
    return !!frame && this.svc.pinnedDetails().some((p) => sameReplayFrame(p.frame, frame));
  });
  readonly zVal = computed(() => this.zIndex() + this.zBoost());
  readonly detailOk = computed(() => {
    const d = this.detailState();
    return d.status === 'ok' ? d : null;
  });
  readonly detailError = computed(() => {
    const d = this.detailState();
    return d.status === 'error' ? d : null;
  });
  readonly errorMessage = computed(() => {
    const d = this.detailState();
    if (d.status !== 'error') return '';
    if (d.kind === 'unavailable') return 'Frame detail unavailable — tshark is not usable on this server.';
    if (d.kind === 'missing') return 'Frame data is stale — the capture may have been rebuilt.';
    return d.message;
  });

  /** Protocol chain for the crumbs row (ETH › IPV4 › TCP …) once decoded. */
  readonly breadcrumb = computed(() => {
    const ok = this.detailOk();
    // Skip PDML plumbing (`geninfo`) and the capture-metadata `frame` proto —
    // the crumbs are the network-protocol chain, like Wireshark's protocol
    // column (eth:ethertype:ip:icmp).
    return ok
      ? ok.detail.tree
          .filter((n) => n.element === 'proto' && n.name !== 'geninfo' && n.name !== 'frame')
          .map((n) => n.name.toUpperCase())
      : [];
  });

  private observer: MutationObserver | null = null;
  private readonly subs: Subscription[] = [];
  private rafId: number | null = null;
  private rafPending = false;

  constructor() {
    // LIVE frame changes may move to another link — re-anchor. Pinned windows
    // never follow the cursor (their frame is frozen), map moves only.
    effect(() => {
      if (!this.pinned() && this.svc.currentFrame()) this.requestReposition();
    });
  }

  ngOnInit(): void {
    // Cascade the FALLBACK spot so several never-anchored windows (links off
    // the map) don't stack pixel-perfect on top of each other.
    const i = this.offsetIndex();
    if (i > 0) {
      this.winLeft.set(this.FALLBACK.left + 24 * i);
      this.winTop.set(this.FALLBACK.top + 24 * i);
    }
    // Pan rewrites g.canvas's transform attribute silently; observing it (with
    // zoom also rewriting the same attribute) covers all map movement.
    const canvas = select('svg#map').select<SVGGElement>('g.canvas').node();
    if (canvas && typeof MutationObserver !== 'undefined') {
      this.observer = new MutationObserver(() => this.requestReposition());
      this.observer.observe(canvas, { attributes: true, attributeFilter: ['transform'] });
    }
    this.subs.push(
      this.mapScale.scaleChangeEmitter.subscribe({ next: () => this.requestReposition() }),
      this.mapSettings.mapRenderedEmitter.subscribe({ next: () => this.requestReposition() })
    );
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.onResize);
    }
    this.requestReposition();
  }

  ngOnDestroy(): void {
    this.teardownDrag();
    this.observer?.disconnect();
    this.observer = null;
    for (const s of this.subs) s.unsubscribe();
    this.subs.length = 0;
    if (typeof window !== 'undefined') window.removeEventListener('resize', this.onResize);
    if (this.rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
    }
  }

  private onResize = (): void => this.requestReposition();

  /** Coalesce reposition requests into one animation-frame pass. */
  private requestReposition(): void {
    if (this.rafPending) return;
    this.rafPending = true;
    if (typeof requestAnimationFrame === 'function') {
      this.rafId = requestAnimationFrame(() => {
        this.rafPending = false;
        this.reposition();
      });
    } else {
      // jsdom / test environments without rAF — reposition synchronously.
      this.rafPending = false;
      this.reposition();
    }
  }

  /** Recompute anchor → window placement → leader line. One pass. */
  private reposition(): void {
    if (this.dragPinned()) {
      // Pinned by drag: keep the user's spot, just never let it escape the
      // viewport (the browser window may have shrunk underneath it).
      const vw = typeof window !== 'undefined' ? window.innerWidth : this.winWidth();
      const vh = typeof window !== 'undefined' ? window.innerHeight : this.winHeight();
      const minTop = 64; // project toolbar
      this.winLeft.set(Math.min(Math.max(this.winLeft(), 0), Math.max(0, vw - this.winWidth())));
      this.winTop.set(Math.min(Math.max(this.winTop(), minTop), Math.max(minTop, vh - this.winHeight())));
    } else {
      const frame = this.activeFrame();
      if (!frame) return;
      const anchor = this.linkCenterScreen(frame.link_id);
      if (anchor) {
        const viewport = {
          width: typeof window !== 'undefined' ? window.innerWidth : this.winWidth(),
          height: typeof window !== 'undefined' ? window.innerHeight : this.winHeight(),
          topOffset: 64, // project toolbar
        };
        const { rect } = placeWindow(anchor, { width: this.winWidth(), height: this.winHeight() }, viewport);
        this.winLeft.set(rect.left);
        this.winTop.set(rect.top);
      }
    }
    this.updateLeader();
  }

  /**
   * Point the leader at the current link from wherever the window sits —
   * placed OR pinned. The window end attaches to the edge facing the anchor.
   */
  private updateLeader(): void {
    const frame = this.activeFrame();
    if (!frame) return;
    const anchor = this.linkCenterScreen(frame.link_id);
    if (!anchor) {
      // Link not on the map (deleted) — keep the last position, drop the leader.
      this.anchored.set(false);
      this.leader.set(null);
      return;
    }
    this.anchored.set(true);
    const left = this.winLeft();
    const top = this.winTop();
    const attachLeftEdge = anchor.x < left + this.winWidth() / 2;
    this.leader.set({
      x1: attachLeftEdge ? left : left + this.winWidth(),
      y1: top + this.winHeight() / 2,
      x2: anchor.x,
      y2: anchor.y,
    });
  }

  /** Link path bounding-box center in viewport px (browser applies all transforms). */
  private linkCenterScreen(linkId: string): { x: number; y: number } | null {
    const path = select('svg#map')
      .select<SVGGElement>(`g.link[link_id="${linkId}"]`)
      .select<SVGPathElement>('path.ethernet_link, path.serial_link')
      .node();
    if (!path) return null;
    const rect = path.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null; // not rendered
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  // ---- drag-resize (mwlResizable; position stays anchor-owned) ----

  /**
   * Arrow property on purpose: the library invokes the callback as
   * `this.validateResize(…)` with the DIRECTIVE as `this`, so a plain method
   * would read the directive's (missing) MIN_W/MIN_H — its guard would silently
   * never fire.
   */
  readonly validate = (event: ResizeEvent): boolean => {
    const w = event.rectangle.width;
    const h = event.rectangle.height;
    if (w !== undefined && w < this.MIN_W) return false;
    if (h !== undefined && h < this.MIN_H) return false;
    return true;
  };

  onResizeStart(): void {
    this.resizing.set(true);
  }

  onResizeEnd(event: ResizeEvent): void {
    // Clamp locally — WindowBoundaryService's config is GLOBAL shared state
    // (its 500px minWidth suits marker-manager, not this window).
    const vw = typeof window !== 'undefined' ? window.innerWidth : this.winWidth();
    const vh = typeof window !== 'undefined' ? window.innerHeight : this.winHeight();
    const width = Math.min(Math.max(event.rectangle.width || this.winWidth(), this.MIN_W), Math.max(vw - 32, this.MIN_W));
    const height = Math.min(Math.max(event.rectangle.height || this.winHeight(), this.MIN_H), Math.max(vh - 96, this.MIN_H));

    this.winWidth.set(width);
    this.winHeight.set(height);
    this.resizing.set(false);
    // Re-place with the new size (may flip to the link's other side / re-clamp).
    this.requestReposition();
  }

  // ---- manual position (header drag pins, re-anchor releases) ----

  /** In-flight drag teardown, set while a header gesture is active. */
  private cleanupDrag: (() => void) | null = null;

  /**
   * Dragging the header moves the window and, on release, PINS it there
   * (auto-anchor off). A plain header click without movement does not pin.
   */
  onHeaderMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement | null)?.closest('button')) return; // buttons click, not drag
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = this.winLeft();
    const startTop = this.winTop();
    const minTop = 64; // project toolbar
    let moved = false;

    const onMove = (ev: MouseEvent): void => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      moved = true;
      const vw = typeof window !== 'undefined' ? window.innerWidth : this.winWidth();
      const vh = typeof window !== 'undefined' ? window.innerHeight : this.winHeight();
      this.winLeft.set(Math.min(Math.max(startLeft + dx, 0), Math.max(0, vw - this.winWidth())));
      this.winTop.set(Math.min(Math.max(startTop + dy, minTop), Math.max(minTop, vh - this.winHeight())));
      this.updateLeader();
    };
    const onUp = (): void => {
      this.teardownDrag();
      this.dragging.set(false);
      if (moved) this.dragPinned.set(true);
      this.updateLeader();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    this.cleanupDrag = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    this.dragging.set(true);
  }

  private teardownDrag(): void {
    this.cleanupDrag?.();
    this.cleanupDrag = null;
  }

  /** Snap back to auto-anchor mode — the window re-places beside its link. */
  reanchor(): void {
    this.dragPinned.set(false);
    this.requestReposition();
  }

  // ---- pinned-snapshot actions ----

  /** Live window's 📌 — freeze the cursor's frame into a comparison window. */
  pinCurrent(): void {
    this.svc.pinCurrent();
  }

  /** Pinned window's ✕ — drop the snapshot. */
  unpinCurrent(): void {
    const p = this.pinned();
    if (p) this.svc.unpin(p.id);
  }

  /** Pinned window's failed decode — try again. */
  retryCurrentPin(): void {
    const p = this.pinned();
    if (p) this.svc.retryPin(p.id);
  }

  // ---- template helpers ----

  frameTime(ts: string): string {
    return formatFrameTime(ts);
  }

  deltaLabel(ts: string): string {
    const frames = this.svc.frames();
    return frames.length ? formatDelta(ts, frames[0].ts) : '';
  }

  /** Link display name ("A → B", cf. marker-manager's linkName). */
  linkLabel(linkId: string): string {
    const link = this.linksDataSource.get(linkId);
    const nodes = link?.nodes;
    if (!nodes || nodes.length < 2) return linkId.slice(0, 8);
    const src = this.nodesDataSource.get(nodes[0].node_id);
    const dst = this.nodesDataSource.get(nodes[1].node_id);
    if (!src || !dst) return linkId.slice(0, 8);
    return `${src.name} → ${dst.name}`;
  }
}
