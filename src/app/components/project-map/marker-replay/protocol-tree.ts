import { ProtocolTreeNode } from '@models/marker-replay';

/**
 * Pure helpers for the flat (non-recursive) protocol-tree renderer.
 *
 * The decoded PDML tree is immutable per frame, so rows are derived state:
 * a depth-first flattening that only descends into nodes whose key sits in
 * the caller's expansion set. Keeping this pure makes collapse/expand,
 * "expand all" and selection trivial signal updates in the component — no
 * per-node state scattered across recursive component instances.
 */

/** One visible row of the flattened tree. */
export interface FlatRow {
  /** Stable path key ("/0/2/1" — index path from the tree root). */
  key: string;
  node: ProtocolTreeNode;
  depth: number;
  hasChildren: boolean;
}

/** Row text: the showname, else `name: show`, else the bare name. */
export function rowText(n: ProtocolTreeNode): string {
  return n.showname ?? (n.show !== undefined ? `${n.name}: ${n.show}` : n.name);
}

/** Hover context: raw field name, show/value attributes, byte range. */
export function rowTooltip(n: ProtocolTreeNode): string {
  const parts = [n.show ?? '', n.value ?? ''].filter(Boolean);
  let text = parts.length ? `${n.name} · ${parts.join(' · ')}` : n.showname || n.name;
  if (n.pos !== undefined && n.size !== undefined) text += `  [${n.pos}+${n.size}]`;
  return text;
}

/**
 * Protos tshark emits as PDML plumbing that Wireshark's GUI never displays
 * (`geninfo` duplicates the `frame` proto's Number/Length/Time fields).
 */
const UNDISPLAYED_PROTOS = new Set(['geninfo']);

/**
 * Whether a node renders at all. tshark marks filter-only combination fields
 * (`ip.addr`, `ip.host`, `eth.addr`, OUI, resolved duplicates…) with
 * `hide="yes"` — Wireshark hides them, so we do too. "true" is tolerated for
 * robustness; missing/other values display.
 */
export function isHidden(n: ProtocolTreeNode): boolean {
  return (
    n.hide === 'yes' ||
    n.hide === 'true' ||
    (n.element === 'proto' && UNDISPLAYED_PROTOS.has(n.name))
  );
}

/** Direct children that render — hidden filter-combination noise is dropped. */
export function visibleChildren(n: ProtocolTreeNode): ProtocolTreeNode[] {
  return (n.children ?? []).filter((c) => !isHidden(c));
}

/**
 * Flatten the decoded tree into the rows currently visible: a child-bearing
 * node only contributes its children while its key is in `expanded`. Keys are
 * index paths within the (hide-filtered) arrays, stable for one decode.
 */
export function flattenTree(tree: ProtocolTreeNode[], expanded: ReadonlySet<string>): FlatRow[] {
  const rows: FlatRow[] = [];
  const walk = (nodes: ProtocolTreeNode[], prefix: string, depth: number): void => {
    nodes.forEach((node, i) => {
      if (isHidden(node)) return;
      const key = `${prefix}/${i}`;
      const kids = visibleChildren(node);
      rows.push({ key, node, depth, hasChildren: kids.length > 0 });
      if (kids.length > 0 && expanded.has(key)) walk(kids, key, depth + 1);
    });
  };
  walk(tree, '', 0);
  return rows;
}

/** Keys of every child-bearing node — the expansion set for "Expand all". */
export function collectKeys(tree: ProtocolTreeNode[]): string[] {
  const keys: string[] = [];
  const walk = (nodes: ProtocolTreeNode[], prefix: string): void => {
    nodes.forEach((node, i) => {
      if (isHidden(node)) return;
      const key = `${prefix}/${i}`;
      const kids = visibleChildren(node);
      if (kids.length > 0) keys.push(key);
      walk(kids, key);
    });
  };
  walk(tree, '');
  return keys;
}
