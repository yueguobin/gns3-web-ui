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

import { MarkerReplayService } from '@services/marker-replay.service';
import { MapScaleService } from '@services/mapScale.service';
import { MapSettingsService } from '@services/mapsettings.service';
import { LinksDataSource } from '../../../cartography/datasources/links-datasource';
import { NodesDataSource } from '../../../cartography/datasources/nodes-datasource';
import { formatDelta, formatFrameTime } from './replay-timeline-math';
import { placeWindow } from './replay-geometry';
import { ProtocolTreeNodeComponent } from './protocol-tree-node.component';

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
 */
@Component({
  selector: 'app-replay-detail-window',
  templateUrl: './replay-detail-window.component.html',
  styleUrl: './replay-detail-window.component.scss',
  imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule, MatProgressSpinnerModule, ProtocolTreeNodeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReplayDetailWindowComponent implements OnInit, OnDestroy {
  readonly zIndex = input(1000);

  readonly svc = inject(MarkerReplayService);
  private readonly mapScale = inject(MapScaleService);
  private readonly mapSettings = inject(MapSettingsService);
  private readonly linksDataSource = inject(LinksDataSource);
  private readonly nodesDataSource = inject(NodesDataSource);

  readonly WIN_W = 400;
  readonly WIN_H = 320;
  /** Fallback position while no anchor has ever resolved (top-right, below toolbar). */
  private readonly FALLBACK = { left: 0, top: 80 };

  readonly winLeft = signal(this.FALLBACK.left);
  readonly winTop = signal(this.FALLBACK.top);
  /** False when the frame's link is not on the map (deleted) or geometry failed. */
  readonly anchored = signal(false);
  /** Leader line geometry; null while unanchored. */
  readonly leader = signal<Leader | null>(null);

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
    const frame = this.svc.currentFrame();
    if (!frame) return;
    const anchor = this.linkCenterScreen(frame.link_id);
    if (!anchor) {
      // Link not on the map (deleted) — keep the last position, drop the leader.
      this.anchored.set(false);
      this.leader.set(null);
      return;
    }
    const viewport = {
      width: typeof window !== 'undefined' ? window.innerWidth : this.WIN_W,
      height: typeof window !== 'undefined' ? window.innerHeight : this.WIN_H,
      topOffset: 64, // project toolbar
    };
    const { rect, side } = placeWindow(anchor, { width: this.WIN_W, height: this.WIN_H }, viewport);
    this.winLeft.set(rect.left);
    this.winTop.set(rect.top);
    this.anchored.set(true);
    // Attach the leader to the window edge FACING the link.
    this.leader.set({
      x1: side === 'right' ? rect.left : rect.left + rect.width,
      y1: rect.top + rect.height / 2,
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
