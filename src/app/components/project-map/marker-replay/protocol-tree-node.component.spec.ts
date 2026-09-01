import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProtocolTreeNodeComponent } from './protocol-tree-node.component';
import { ProtocolTreeNode } from '@models/marker-replay';

describe('ProtocolTreeNodeComponent', () => {
  let fixture: ComponentFixture<ProtocolTreeNodeComponent>;

  const ttlField: ProtocolTreeNode = {
    element: 'field',
    name: 'ip.ttl',
    showname: 'Time to Live: 64',
    show: '64',
    value: '40',
    size: '1',
    pos: '22',
    children: [],
  };
  const ipProto: ProtocolTreeNode = {
    element: 'proto',
    name: 'ip',
    showname: 'Internet Protocol Version 4, Src: 10.0.0.1, Dst: 10.0.0.2',
    children: [ttlField, { ...ttlField, name: 'ip.checksum', showname: 'Header Checksum: 0x1234', hide: 'true' }],
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({ imports: [ProtocolTreeNodeComponent] }).compileComponents();
    fixture = TestBed.createComponent(ProtocolTreeNodeComponent);
  });

  afterEach(() => {
    if (fixture) fixture.destroy();
  });

  it('renders the showname split into label/value (values verbatim strings)', () => {
    fixture.componentRef.setInput('node', ttlField);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.gns3-replay__tree-label')?.textContent).toBe('Time to Live:');
    expect(el.querySelector('.gns3-replay__tree-value')?.textContent).toBe('64');
  });

  it('keeps the raw name and [pos+size] out of the row — they live in the tooltip', () => {
    fixture.componentRef.setInput('node', ttlField);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.gns3-replay__tree-name')).toBeNull();
    expect(el.querySelector('.gns3-replay__tree-loc')).toBeNull();
    expect(el.querySelector('.gns3-replay__tree-row')?.getAttribute('title')).toContain('ip.ttl');
    expect(el.querySelector('.gns3-replay__tree-row')?.getAttribute('title')).toContain('[22+1]');
  });

  it('proto rows keep the whole showname as their heading (no label/value split)', () => {
    fixture.componentRef.setInput('node', ipProto);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.gns3-replay__tree-row--proto .gns3-replay__tree-showname')?.textContent).toBe(
      'Internet Protocol Version 4, Src: 10.0.0.1, Dst: 10.0.0.2'
    );
    expect(el.querySelector('.gns3-replay__tree-row--proto .gns3-replay__tree-label')).toBeNull();
  });

  it('fields without a showname fall back to name + show/value', () => {
    fixture.componentRef.setInput('node', { ...ttlField, showname: undefined });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.gns3-replay__tree-label')?.textContent).toBe('ip.ttl');
    expect(el.querySelector('.gns3-replay__tree-value')?.textContent).toBe('64');
  });

  it('shownames without a ": " render as one plain span', () => {
    fixture.componentRef.setInput('node', { ...ttlField, showname: 'No matching signature' });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.gns3-replay__tree-showname')?.textContent).toBe('No matching signature');
    expect(el.querySelector('.gns3-replay__tree-label')).toBeNull();
  });

  it('expands top-level protocols by default and renders their children', () => {
    fixture.componentRef.setInput('node', ipProto);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const rows = el.querySelectorAll('.gns3-replay__tree-row');
    expect(rows.length).toBe(3); // proto + two fields
    expect(el.querySelector('.gns3-replay__tree-row--proto')).toBeTruthy();
  });

  it('child-bearing FIELDS start collapsed and expand on click', () => {
    const parent: ProtocolTreeNode = {
      element: 'field',
      name: 'ip.flags',
      showname: 'Flags: 0x4000',
      children: [ttlField],
    };
    fixture.componentRef.setInput('node', parent);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.gns3-replay__tree-row').length).toBe(1); // collapsed

    el.querySelector<HTMLElement>('.gns3-replay__tree-row')!.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.gns3-replay__tree-row').length).toBe(2);
  });

  it('dimms hide="true" nodes but keeps them visible', () => {
    fixture.componentRef.setInput('node', ipProto);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const hidden = el.querySelector('.gns3-replay__tree-row--hidden');
    expect(hidden).toBeTruthy();
    expect(hidden!.textContent).toContain('Checksum');
  });

  it('leaf nodes (no children) render a spacer, no chevron, and do not toggle', () => {
    fixture.componentRef.setInput('node', ttlField);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.gns3-replay__tree-chevron')).toBeNull();
    expect(el.querySelector('.gns3-replay__tree-leaf')).toBeTruthy();
  });
});
