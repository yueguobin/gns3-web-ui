import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of, throwError, Subject } from 'rxjs';
import { MarkerReplayOverlayComponent } from './marker-replay-overlay.component';
import { MarkerReplayService } from '@services/marker-replay.service';
import { HttpController } from '@services/http-controller.service';
import { ToasterService } from '@services/toaster.service';
import { MapScaleService } from '@services/mapScale.service';
import { MapSettingsService } from '@services/mapsettings.service';
import { LinksDataSource } from '../../../cartography/datasources/links-datasource';
import { NodesDataSource } from '../../../cartography/datasources/nodes-datasource';
import { EventEmitter } from '@angular/core';
import { Controller } from '@models/controller';
import { Project } from '@models/project';
import { ReplayFrame, ReplayRangeResponse } from '@models/marker-replay';

describe('MarkerReplayOverlayComponent', () => {
  let fixture: ComponentFixture<MarkerReplayOverlayComponent>;
  let component: MarkerReplayOverlayComponent;
  let svc: MarkerReplayService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockHttp: any;

  const controller = { id: 1 } as Controller;
  const project = { project_id: 'p1' } as Project;

  const frames: ReplayFrame[] = [
    { ts: '1.100000', len: 60, node_id: 'n1', link_id: 'l1', marker: 'm', frame_number: 1 },
    { ts: '1.200000', len: 70, node_id: 'n1', link_id: 'l2', marker: 'm', frame_number: 2 },
  ];
  const range: ReplayRangeResponse = {
    tag: 7,
    start: '1.100000',
    end: '1.200000',
    frame_count: 2,
    truncated: false,
    sources: [],
    frames,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockHttp = { get: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [MarkerReplayOverlayComponent],
      providers: [
        { provide: HttpController, useValue: mockHttp },
        { provide: ToasterService, useValue: { error: vi.fn(), success: vi.fn() } },
        { provide: MapScaleService, useValue: { scaleChangeEmitter: new EventEmitter() } },
        { provide: MapSettingsService, useValue: { mapRenderedEmitter: new EventEmitter() } },
        { provide: LinksDataSource, useValue: { get: vi.fn().mockReturnValue(null) } },
        { provide: NodesDataSource, useValue: { get: vi.fn().mockReturnValue(null) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MarkerReplayOverlayComponent);
    component = fixture.componentInstance;
    // The replay service is a component-level provider — resolve it from the
    // component's own injector, not the TestBed root injector.
    svc = fixture.componentRef.injector.get(MarkerReplayService);
    fixture.componentRef.setInput('controller', controller);
    fixture.componentRef.setInput('project', project);
    fixture.componentRef.setInput('tag', 7);
  });

  afterEach(() => {
    if (fixture) fixture.destroy();
  });

  it('starts the session on init and shows the timeline once loaded', () => {
    mockHttp.get.mockReturnValue(of(range));
    fixture.detectChanges();

    expect(svc.mode()).toBe('frames');
    expect(svc.frames()).toHaveLength(2);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.gns3-replay')).toBeTruthy();
    expect(el.textContent).toContain('frame 1 / 2'); // header position label
    expect(el.querySelector('.gns3-replay__state')).toBeNull(); // loading gone
  });

  it('shows the loading state while the range is in flight', () => {
    mockHttp.get.mockReturnValue(new Subject()); // never emits
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.gns3-replay__state')?.textContent).toContain('Loading timeline');
  });

  it('shows the empty state for a tag with no captured frames', () => {
    mockHttp.get.mockReturnValue(
      of({ ...range, start: null, end: null, frame_count: 0, frames: [] })
    );
    fixture.detectChanges();

    expect(svc.isEmpty()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('No frames captured under this tag');
  });

  it('network errors keep the overlay open with a working Retry', () => {
    mockHttp.get.mockReturnValue(throwError(() => ({ error: { message: 'boom' }, message: 'boom' })));
    fixture.detectChanges();

    expect(svc.rangeErrorKind()).toBe('network');
    const el: HTMLElement = fixture.nativeElement;
    const retry = el.querySelector<HTMLButtonElement>('.gns3-replay__retry');
    expect(retry).toBeTruthy();

    mockHttp.get.mockReturnValue(of(range));
    retry!.click();
    fixture.detectChanges();
    expect(svc.rangeError()).toBeNull();
    expect(svc.frames()).toHaveLength(2);
  });

  it('a gate (409) error auto-closes the overlay', () => {
    const emitted = vi.fn();
    component.closeWindow.subscribe(emitted);
    mockHttp.get.mockReturnValue(
      throwError(() => ({
        error: { message: 'Cannot replay tag 7 while markers are capturing' },
        message: 'Cannot replay tag 7 while markers are capturing',
        originalError: { status: 409 },
      }))
    );
    fixture.detectChanges();
    fixture.detectChanges(); // effect flush

    expect(svc.rangeErrorKind()).toBe('gate');
    expect(emitted).toHaveBeenCalled();
  });

  it('the close button emits closeWindow', () => {
    mockHttp.get.mockReturnValue(of(range));
    fixture.detectChanges();

    const emitted = vi.fn();
    component.closeWindow.subscribe(emitted);
    const el: HTMLElement = fixture.nativeElement;
    el.querySelector<HTMLButtonElement>('.gns3-replay__close')!.click();
    expect(emitted).toHaveBeenCalled();
  });
});
