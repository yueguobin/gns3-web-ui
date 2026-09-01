import { ChangeDetectionStrategy, Component, OnInit, computed, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

import { ProtocolTreeNode } from '@models/marker-replay';

/**
 * One PDML-isomorphic tree node, rendered recursively (the component lists
 * ITSELF in `imports` — standalone self-reference). Every attribute value is a
 * string from the server and is rendered as-is; no numeric coercion anywhere.
 *
 * Expand rules follow Wireshark's defaults: top-level protocol (`<proto>`)
 * nodes start expanded; fields carrying children start collapsed.
 * `hide === "true"` nodes render dimmed but visible (PDML marks e.g. padding).
 */
@Component({
  selector: 'app-protocol-tree-node',
  template: `
    <div class="gns3-replay__tree-node">
      <div
        class="gns3-replay__tree-row"
        [class.gns3-replay__tree-row--proto]="node().element === 'proto'"
        [class.gns3-replay__tree-row--hidden]="node().hide === 'true'"
        [style.padding-left.px]="depth() * 14 + 8"
        (click)="toggle()"
        [title]="tooltip()"
      >
        @if (hasChildren()) {
          <mat-icon class="gns3-replay__tree-chevron">{{ expanded() ? 'expand_more' : 'chevron_right' }}</mat-icon>
        } @else {
          <span class="gns3-replay__tree-leaf"></span>
        }
        <span class="gns3-replay__tree-name">{{ node().name }}</span>
        <span class="gns3-replay__tree-showname">{{ node().showname }}</span>
        @if (node().pos !== undefined && node().size !== undefined) {
          <span class="gns3-replay__tree-loc">[{{ node().pos }}+{{ node().size }}]</span>
        }
      </div>
      @if (expanded() && hasChildren()) {
        <div class="gns3-replay__tree-children">
          @for (child of node().children; track $index) {
            <app-protocol-tree-node [node]="child" [depth]="depth() + 1"></app-protocol-tree-node>
          }
        </div>
      }
    </div>
  `,
  imports: [CommonModule, MatIconModule, ProtocolTreeNodeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProtocolTreeNodeComponent implements OnInit {
  readonly node = input.required<ProtocolTreeNode>();
  readonly depth = input(0);

  readonly expanded = signal(false);

  readonly hasChildren = computed(() => (this.node().children?.length ?? 0) > 0);

  /** Raw attribute context on hover (all values are strings, verbatim). */
  readonly tooltip = computed(() => {
    const n = this.node();
    const parts = [n.show ?? '', n.value ?? ''].filter(Boolean);
    return parts.length ? parts.join(' · ') : n.showname;
  });

  ngOnInit(): void {
    // Wireshark default: protocols expanded one level, child-bearing fields collapsed.
    if (this.node().element === 'proto' && this.depth() === 0) {
      this.expanded.set(true);
    }
  }

  toggle(): void {
    if (this.hasChildren()) this.expanded.set(!this.expanded());
  }
}
