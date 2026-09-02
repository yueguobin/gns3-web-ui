import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProtocolTreeComponent } from './protocol-tree.component';
import { collectKeys, flattenTree, rowText } from './protocol-tree';
import { ProtocolTreeNode } from '@models/marker-replay';

describe('protocol-tree pure helpers', () => {
  const ttl: ProtocolTreeNode = {
    element: 'field',
    name: 'ip.ttl',
    showname: 'Time to Live: 64',
    show: '64',
    value: '40',
    size: '1',
    pos: '22',
    children: [],
  };
  const flags: ProtocolTreeNode = {
    element: 'field',
    name: 'ip.flags',
    showname: 'Flags: 0x4000',
    children: [{ ...ttl, name: 'ip.flags.rb', showname: 'Reserved bit: Not set' }],
  };
  const ip: ProtocolTreeNode = {
    element: 'proto',
    name: 'ip',
    showname: 'Internet Protocol Version 4, Src: 10.0.0.1',
    children: [ttl, flags, { ...ttl, name: 'ip.padding', hide: 'yes' }],
  };
  const tree = [ip];

  it('flattenTree with an empty expansion set yields just the top-level protos', () => {
    const rows = flattenTree(tree, new Set());
    expect(rows.map((r) => r.key)).toEqual(['/0']);
    expect(rows[0]).toMatchObject({ depth: 0, hasChildren: true });
  });

  it('descends only into expanded keys, tracking depth', () => {
    const rows = flattenTree(tree, new Set(['/0']));
    expect(rows.map((r) => r.key)).toEqual(['/0', '/0/0', '/0/1']);
    expect(rows[1]).toMatchObject({ depth: 1, hasChildren: false });
    expect(rows[2]).toMatchObject({ depth: 1, hasChildren: true });

    const deep = flattenTree(tree, new Set(['/0', '/0/1']));
    expect(deep.map((r) => r.key)).toEqual(['/0', '/0/0', '/0/1', '/0/1/0']);
    expect(deep[3].depth).toBe(2);
  });

  it('hide="yes" fields never produce rows (real tshark marks filter-only combination fields this way)', () => {
    const rows = flattenTree(tree, new Set(['/0']));
    expect(rows.some((r) => r.node.name === 'ip.padding')).toBe(false);
  });

  it('drops hide="yes" AND hide="true", plus the geninfo plumbing proto', () => {
    const geninfo: ProtocolTreeNode = {
      element: 'proto',
      name: 'geninfo',
      showname: 'General information',
      children: [],
    };
    const real = [
      geninfo,
      {
        ...ip,
        children: [
          ttl,
          { ...ttl, name: 'ip.addr', showname: 'Source or Destination Address: 10.1.10.101', hide: 'yes' },
          { ...ttl, name: 'ip.host', showname: 'Source or Destination Host: 10.1.10.101', hide: 'true' },
        ],
      },
    ];
    const rows = flattenTree(real, new Set(['/1']));
    expect(rows.map((r) => r.node.name)).toEqual(['ip', 'ip.ttl']);
    expect(collectKeys(real)).toEqual(['/1']);
  });

  it('collectKeys returns every child-bearing key (the expand-all set)', () => {
    expect(collectKeys(tree)).toEqual(['/0', '/0/1']);
  });

  it('rowText prefers showname, falls back to "name: show", then the name', () => {
    expect(rowText(ttl)).toBe('Time to Live: 64');
    expect(rowText({ ...ttl, showname: undefined })).toBe('ip.ttl: 64');
    expect(rowText({ ...ttl, showname: undefined, show: undefined })).toBe('ip.ttl');
  });

  it('rows carry a semantic name-path (the diff keyspace), occurrence-disambiguated', () => {
    const rows = flattenTree(tree, new Set(['/0', '/0/1']));
    expect(rows.map((r) => r.path)).toEqual(['ip', 'ip/ip.ttl', 'ip/ip.flags', 'ip/ip.flags/ip.flags.rb']);

    // A repeated sibling name gets [k] suffixes so paths never collide — even
    // when a hidden field sits between them (hidden nodes stay uncounted).
    const repeats: ProtocolTreeNode[] = [
      {
        element: 'proto',
        name: 'tcp',
        showname: 'TCP',
        children: [
          { ...ttl, name: 'tcp.option' },
          { ...ttl, name: 'tcp.pad', hide: 'yes' },
          { ...ttl, name: 'tcp.option', showname: 'Second option' },
        ],
      },
    ];
    expect(flattenTree(repeats, new Set(['/0'])).map((r) => r.path)).toEqual([
      'tcp',
      'tcp/tcp.option[0]',
      'tcp/tcp.option[1]',
    ]);
  });
});

describe('ProtocolTreeComponent', () => {
  let fixture: ComponentFixture<ProtocolTreeComponent>;
  let component: ProtocolTreeComponent;

  const ttl: ProtocolTreeNode = {
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
    children: [ttl, { ...ttl, name: 'ip.checksum', showname: 'Header Checksum: 0x1234', hide: 'yes' }],
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({ imports: [ProtocolTreeComponent] }).compileComponents();
    fixture = TestBed.createComponent(ProtocolTreeComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('tree', [ipProto]);
  });

  afterEach(() => {
    if (fixture) fixture.destroy();
  });

  function rows(): NodeListOf<Element> {
    return (fixture.nativeElement as HTMLElement).querySelectorAll('.gns3-replay__tree-row');
  }

  it('starts fully collapsed — only protocol rows are visible', () => {
    fixture.detectChanges();
    expect(rows().length).toBe(1);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Internet Protocol Version 4');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Time to Live');
  });

  it('clicking a protocol row selects it and expands its children; hide fields stay out', () => {
    fixture.detectChanges();
    (rows()[0] as HTMLElement).click();
    fixture.detectChanges();

    expect(rows().length).toBe(2); // proto + ttl (checksum is hide="true")
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Time to Live: 64');
    expect(rows()[0].classList).toContain('gns3-replay__tree-row--selected');

    (rows()[0] as HTMLElement).click(); // collapse again
    fixture.detectChanges();
    expect(rows().length).toBe(1);
  });

  it('selection is single — clicking another row moves the highlight', () => {
    fixture.detectChanges();
    (rows()[0] as HTMLElement).click();
    fixture.detectChanges();
    (rows()[1] as HTMLElement).click();
    fixture.detectChanges();

    const selected = (fixture.nativeElement as HTMLElement).querySelectorAll('.gns3-replay__tree-row--selected');
    expect(selected.length).toBe(1);
    expect(selected[0].textContent).toContain('Time to Live');
  });

  it('guide rails render one column per ancestor depth', () => {
    fixture.detectChanges();
    (rows()[0] as HTMLElement).click();
    fixture.detectChanges();

    const depth1 = rows()[1] as HTMLElement;
    expect(depth1.querySelectorAll('.gns3-replay__tree-guide').length).toBe(1);
    expect((rows()[0] as HTMLElement).querySelectorAll('.gns3-replay__tree-guide').length).toBe(0);
  });

  it('Expand all opens every level; Collapse all returns to the protocol list', () => {
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const buttons = el.querySelectorAll<HTMLButtonElement>('.gns3-replay__tree-tool');
    expect(buttons.length).toBe(2);

    buttons[0].click(); // expand all
    fixture.detectChanges();
    expect(rows().length).toBe(2); // proto + ttl in this fixture

    buttons[1].click(); // collapse all
    fixture.detectChanges();
    expect(rows().length).toBe(1);
  });

  it('leaf rows show a spacer instead of a chevron', () => {
    fixture.detectChanges();
    (rows()[0] as HTMLElement).click();
    fixture.detectChanges();

    const leaf = rows()[1] as HTMLElement;
    expect(leaf.querySelector('.gns3-replay__tree-chevron')).toBeNull();
    expect(leaf.querySelector('.gns3-replay__tree-leaf')).toBeTruthy();
  });

  describe('cross-window diff highlight', () => {
    it('a changed leaf lights up and its collapsed ancestor is flagged', () => {
      fixture.componentRef.setInput('changedPaths', new Set(['ip/ip.ttl']));
      fixture.detectChanges();

      // Collapsed: the ip proto row carries the subtle "changed inside" flag.
      expect(rows()[0].classList).toContain('gns3-replay__tree-row--changed-subtree');
      expect(rows()[0].classList).not.toContain('gns3-replay__tree-row--changed');

      (rows()[0] as HTMLElement).click(); // expand
      fixture.detectChanges();
      const leaf = rows()[1];
      expect(leaf.classList).toContain('gns3-replay__tree-row--changed');
      expect(leaf.classList).not.toContain('gns3-replay__tree-row--changed-subtree');

      // The toolbar shows the differing-field count.
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('1 differ');
    });

    it('unchanged paths render without diff classes; null clears everything', () => {
      fixture.componentRef.setInput('changedPaths', new Set(['eth/eth.src']));
      fixture.detectChanges();
      (rows()[0] as HTMLElement).click();
      fixture.detectChanges();
      expect(rows()[0].classList).not.toContain('gns3-replay__tree-row--changed-subtree');
      expect(rows()[1].classList).not.toContain('gns3-replay__tree-row--changed');

      fixture.componentRef.setInput('changedPaths', null);
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('differ');
    });
  });
});
