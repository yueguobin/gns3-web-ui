import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
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

import { MarkerReplayService } from '@services/marker-replay.service';
import { MapScaleService } from '@services/mapScale.service';
import { MapSettingsService } from '@services/mapsettings.service';
import { LinksDataSource } from '../../../cartography/datasources/links-datasource';
import { NodesDataSource } from '../../../cartography/datasources/nodes-datasource';
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
 * The current frame's detail window, ANCHORED next to its source link:
 *  - a leader line (screen-space SVG overlay) ties the window to the link —
 *    a plain "this window describes this link" callout with a DOT at the link
 *    end, deliberately NOT an arrowhead (must not read as a traffic direction);
 *  - the link itself stays persistently highlighted (`marker-replay-active`,
 *    toggled by the service) while it carries the current frame;
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
   * keeps tracking the link. `reanchor()` snaps back to placed mode.
   */
  readonly pinned = signal(false);
  /** True while a header drag gesture is in flight. */
  readonly dragging = signal(false);
  /** False when the frame's link is not on the map (deleted) or geometry failed. */
  readonly anchored = signal(false);
  /** Leader line geometry; null while unanchored. */
  readonly leader = signal<Leader | null>(null);
  /** True while a resize gesture is in flight (suppresses anchor re-placement). */
  readonly resizing = signal(false);

  /** Type-narrowed views of the detail state for the template. */
  readonly detailOk = computed(() => {
    const d = this.svc.detail();
    return d.status === 'ok' ? d : null;
  });
  readonly detailError = computed(() => {
    const d = this.svc.detail();
    return d.status === 'error' ? d : null;
  });
  readonly errorMessage = computed(() => {
    const d = this.svc.detail();
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
    // Frame changes may move to another link — re-anchor.
    effect(() => {
      if (this.svc.currentFrame()) this.requestReposition();
    });
  }

  ngOnInit(): void {
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
    if (this.pinned()) {
      // Pinned by drag: keep the user's spot, just never let it escape the
      // viewport (the browser window may have shrunk underneath it).
      const vw = typeof window !== 'undefined' ? window.innerWidth : this.winWidth();
      const vh = typeof window !== 'undefined' ? window.innerHeight : this.winHeight();
      const minTop = 64; // project toolbar
      this.winLeft.set(Math.min(Math.max(this.winLeft(), 0), Math.max(0, vw - this.winWidth())));
      this.winTop.set(Math.min(Math.max(this.winTop(), minTop), Math.max(minTop, vh - this.winHeight())));
    } else {
      const frame = this.svc.currentFrame();
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
    const frame = this.svc.currentFrame();
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
      if (moved) this.pinned.set(true);
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
    this.pinned.set(false);
    this.requestReposition();
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
