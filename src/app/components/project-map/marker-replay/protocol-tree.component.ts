import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ProtocolTreeNode } from '@models/marker-replay';
import { FlatRow, collectKeys, flattenTree, rowText, rowTooltip } from './protocol-tree';
import { ancestorPaths } from './replay-tree-diff';

/**
 * Wireshark-style packet-detail tree, rendered FLAT (one component, one
 * `@for`): the PDML tree is flattened by {@link flattenTree} against an
 * expansion-key set, so these all stay simple signal writes:
 *
 *  - COLLAPSED BY DEFAULT — the initial view is just the protocol list
 *    (Ethernet II / IP / TCP…); the crumbs row above gives the chain at a
 *    glance, clicking a protocol dives in;
 *  - indentation is fixed-width guide columns (one 12px column per ancestor,
 *    hairline on its left edge) instead of piled-up row padding — columns
 *    align across rows, so the hierarchy reads as vertical rails;
 *  - clicking a row SELECTS it (Wireshark's blue row highlight) and toggles
 *    expansion when it carries children;
 *  - an Expand-all / Collapse-all toolbar mirrors Wireshark's tree buttons.
 *
 * `hide="true"` fields never render (Wireshark hides them too); monospace is
 * deliberate — bit-mask rows (`0100 .... = Version: 4`) only align in a
 * fixed-width font.
 */
@Component({
  selector: 'app-protocol-tree',
  templateUrl: './protocol-tree.component.html',
  styleUrl: './protocol-tree.component.scss',
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProtocolTreeComponent {
  readonly tree = input.required<ProtocolTreeNode[]>();
  /**
   * Cross-window comparison diff (pinned windows with ≥2 decoded frames):
   * paths of leaves that differ between them, plus (derived) their ancestors
   * so collapsed protocol rows still flag "something inside changed". Null on
   * the live window — there is nothing to compare it against.
   */
  readonly changedPaths = input<ReadonlySet<string> | null>(null);

  readonly expanded = signal<ReadonlySet<string>>(new Set());
  readonly selectedKey = signal<string | null>(null);

  readonly rows = computed(() => flattenTree(this.tree(), this.expanded()));
  readonly hasExpandable = computed(() => collectKeys(this.tree()).length > 0);
  readonly diffAncestors = computed(() => {
    const changed = this.changedPaths();
    return changed ? ancestorPaths(changed) : new Set<string>();
  });

  readonly rowText = rowText;
  readonly rowTooltip = rowTooltip;

  /** Click = select (always) + toggle expansion (when it carries children). */
  toggle(row: FlatRow): void {
    this.selectedKey.set(row.key);
    if (!row.hasChildren) return;
    const next = new Set(this.expanded());
    if (next.has(row.key)) next.delete(row.key);
    else next.add(row.key);
    this.expanded.set(next);
  }

  expandAll(): void {
    this.expanded.set(new Set(collectKeys(this.tree())));
  }

  collapseAll(): void {
    this.expanded.set(new Set());
  }

  /** One empty guide column per ancestor level (`@for` needs an iterable). */
  guides(depth: number): undefined[] {
    return Array.from({ length: depth });
  }
}
