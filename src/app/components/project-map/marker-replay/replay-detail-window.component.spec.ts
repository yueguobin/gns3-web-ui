import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { of } from 'rxjs';
import { EventEmitter } from '@angular/core';

import { ReplayDetailWindowComponent } from './replay-detail-window.component';
import { MarkerReplayService } from '@services/marker-replay.service';
import { HttpController } from '@services/http-controller.service';
import { ToasterService } from '@services/toaster.service';
import { MapScaleService } from '@services/mapScale.service';
import { MapSettingsService } from '@services/mapsettings.service';
import { LinksDataSource } from '../../../cartography/datasources/links-datasource';
import { NodesDataSource } from '../../../cartography/datasources/nodes-datasource';
import { Controller } from '@models/controller';
import { ReplayFrame, ReplayFrameDetail, ReplayRangeResponse } from '@models/marker-replay';

describe('ReplayDetailWindowComponent', () => {
  let fixture: ComponentFixture<ReplayDetailWindowComponent>;
  let component: ReplayDetailWindowComponent;
  let svc: MarkerReplayService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockHttp: any;
  let svgFixture: SVGSVGElement | null;

  const controller = { id: 1 } as Controller;

  const frames: ReplayFrame[] = [
    { ts: '1788196663.100000', len: 98, node_id: 'n1', link_id: 'l1', marker: 'global-arp', frame_number: 1 },
    { ts: '1788196663.200000', len: 74, node_id: 'n1', link_id: 'l2', marker: 'global-arp', frame_number: 2 },
  ];
  const range: ReplayRangeResponse = {
    tag: 7,
    start: frames[0].ts,
    end: frames[1].ts,
    frame_count: 2,
    truncated: false,
    sources: [],
    frames,
  };
  const detail: ReplayFrameDetail = {
    ts: frames[0].ts,
    source: { node_id: 'n1', link_id: 'l1', marker: 'global-arp', frame_number: 1 },
    tshark_version: 'TShark 4.6.7',
    field_count: 2,
    hex: 'ab',
    tree: [
      {
        element: 'proto',
        name: 'ip',
        showname: 'Internet Protocol Version 4, Src: 10.0.0.1',
        children: [
          { element: 'field', name: 'ip.ttl', showname: 'Time to Live: 64', show: '64', value: '40', size: '1', pos: '22', children: [] },
        ],
      },
    ],
  };

  /** svg#map with a link group whose path reports a nonzero screen rect. */
  function buildMap(linkId: string) {
    svgFixture = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgFixture.id = 'map';
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'link');
    g.setAttribute('link_id', linkId);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'ethernet_link');
    g.appendChild(path);
    svgFixture.appendChild(g);
    document.body.appendChild(svgFixture);
    return path;
  }

  // Per the unit-testing skill: zoneless async tests always run under fake
  // timers (real macrotask awaits starve under the zoneless scheduler here).
  // Fake timers also drive the component's rAF-coalesced reposition passes.
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockHttp = { get: vi.fn().mockReturnValue(of(range)) };

    await TestBed.configureTestingModule({
      imports: [ReplayDetailWindowComponent],
      providers: [
        MarkerReplayService,
        { provide: HttpController, useValue: mockHttp },
        { provide: ToasterService, useValue: { error: vi.fn(), success: vi.fn() } },
        // App-module-level in production; plain emitters are all the window needs.
        { provide: MapScaleService, useValue: { scaleChangeEmitter: new EventEmitter() } },
        { provide: MapSettingsService, useValue: { mapRenderedEmitter: new EventEmitter() } },
        { provide: LinksDataSource, useValue: { get: vi.fn().mockReturnValue(null) } },
        { provide: NodesDataSource, useValue: { get: vi.fn().mockReturnValue(null) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReplayDetailWindowComponent);
    component = fixture.componentInstance;
    svc = TestBed.inject(MarkerReplayService);
    fixture.componentRef.setInput('zIndex', 1100);
  });

  afterEach(() => {
    if (fixture) fixture.destroy();
    if (svgFixture) {
      svgFixture.remove();
      svgFixture = null;
    }
    vi.restoreAllMocks();
  });

  /** Advance the fake clock past the rAF reposition pass, then re-render. */
  async function flushFrames() {
    await vi.advanceTimersByTimeAsync(50);
    fixture.detectChanges();
  }

  async function load(linkOnMap = true) {
    if (linkOnMap) {
      const path = buildMap('l1');
      // jsdom rects are 0×0 — stub the path's rect so the anchor resolves.
      vi.spyOn(path, 'getBoundingClientRect').mockReturnValue(
        DOMRect.fromRect({ x: 500, y: 300, width: 120, height: 2 })
      );
    }
    svc.start(controller, 'p1', 7);
    fixture.detectChanges();
    await flushFrames();
  }

  it('renders metadata for the current frame (time/len/frame#)', async () => {
    await load();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.gns3-replay__window')).toBeTruthy();
    expect(el.textContent).toContain('98 B');
    expect(el.textContent).toContain('#1');
    expect(el.querySelector('.gns3-replay__window--unanchored')).toBeNull();
  });

  it('draws the leader line to the link when anchored', async () => {
    await load();
    const el: HTMLElement = fixture.nativeElement;
    const svg = el.querySelector<SVGSVGElement>('.gns3-replay__leader');
    expect(svg).toBeTruthy();
    const line = svg!.querySelector('line');
    expect(line?.getAttribute('x2')).toBe('560'); // rect center x = 500 + 120/2
    expect(line?.getAttribute('y2')).toBe('301');
  });

  it('falls back to unanchored (no leader) when the link is not on the map', async () => {
    load(false);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.gns3-replay__window--unanchored')).toBeTruthy();
    expect(el.textContent).toContain('unanchored');
    expect(el.querySelector('.gns3-replay__leader')).toBeNull();
  });

  it('renders the decoded protocol tree', async () => {
    await load();
    svc.detail.set({ status: 'ok', detail });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const rows = el.querySelectorAll('.gns3-replay__tree-row');
    expect(rows.length).toBe(2); // proto expanded by default → field visible
    expect(el.textContent).toContain('Time to Live: 64');
  });

  it('unavailable (tshark) errors render inline with a Retry that re-fires the pipeline', async () => {
    await load();
    const retry = vi.spyOn(svc, 'retryDetail');
    svc.detail.set({ status: 'error', kind: 'unavailable', message: 'tshark is not installed', frame: frames[0] });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('tshark');
    const btn = el.querySelector<HTMLButtonElement>('.gns3-replay__detail-error button')!;
    expect(btn.textContent).toContain('Retry');
    btn.click();
    expect(retry).toHaveBeenCalled();
  });

  it('missing (stale ts) errors offer a timeline reload', async () => {
    await load();
    const reload = vi.spyOn(svc, 'reloadTimeline');
    svc.detail.set({ status: 'error', kind: 'missing', message: 'no frame matches ts', frame: frames[0] });
    fixture.detectChanges();

    const el2: HTMLElement = fixture.nativeElement;
    const btn = el2.querySelector<HTMLButtonElement>('.gns3-replay__detail-error button')!;
    expect(btn.textContent).toContain('Reload timeline');
    btn.click();
    expect(reload).toHaveBeenCalled();
  });

  it('shows the idle hint before any decode has settled', async () => {
    await load();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.gns3-replay__detail-state')?.textContent).toContain('settle on a frame');
  });
});
