import { ChangeDetectionStrategy, Component, OnInit, computed, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

import { ProtocolTreeNode } from '@models/marker-replay';

/**
 * One PDML-isomorphic tree node, rendered recursively (the component lists
 * ITSELF in `imports` — standalone self-reference). Every attribute value is a
 * string from the server and is rendered as-is; no numeric coercion anywhere.
 *
 * Rows show the friendly `showname` ONLY (Wireshark-tree style); the raw field
 * `name` and the `[pos+size]` byte range live in the hover tooltip. A showname
 * is split at its first ": " into a subdued label and an emphasised value
 * ("Time to Live: 64") — protocol rows keep the whole sentence as their section
 * heading (their showname holds several "k: v" pairs, splitting would mangle
 * it). Fields without a showname fall back to `name: show|value`.
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
        @if (isProto()) {
          <span class="gns3-replay__tree-showname">{{ node().showname || node().name }}</span>
        } @else if (label(); as l) {
          <span class="gns3-replay__tree-label">{{ l }}</span>
          <span class="gns3-replay__tree-value">{{ value() }}</span>
        } @else {
          <span class="gns3-replay__tree-showname">{{ fallbackText() }}</span>
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
  readonly isProto = computed(() => this.node().element === 'proto');

  /**
   * Field-row label: the showname part before the first ": ", or the raw field
   * name when the showname has no "k: v" shape (then the value goes in `value`).
   * Protocol rows never split (see class doc) — null there.
   */
  readonly label = computed<string | null>(() => {
    if (this.isProto()) return null;
    const sn = this.node().showname;
    if (!sn) return this.node().name;
    const i = sn.indexOf(': ');
    return i === -1 ? null : sn.slice(0, i + 1);
  });

  /** Field-row value paired with {@link label} (showname tail, or show/value). */
  readonly value = computed(() => {
    const sn = this.node().showname;
    if (sn) {
      const i = sn.indexOf(': ');
      return i === -1 ? '' : sn.slice(i + 2);
    }
    return this.node().show ?? this.node().value ?? '';
  });

  /** Plain single-span text for fields whose showname is not "label: value". */
  readonly fallbackText = computed(() => this.node().showname ?? '');

  /** Raw attribute context on hover (all values are strings, verbatim). */
  readonly tooltip = computed(() => {
    const n = this.node();
    const parts = [n.show ?? '', n.value ?? ''].filter(Boolean);
    let text = parts.length ? `${n.name} · ${parts.join(' · ')}` : n.showname || n.name;
    if (n.pos !== undefined && n.size !== undefined) text += `  [${n.pos}+${n.size}]`;
    return text;
  });

  ngOnInit(): void {
    // Wireshark default: protocols expanded one level, child-bearing fields collapsed.
    if (this.isProto() && this.depth() === 0) {
      this.expanded.set(true);
    }
  }

  toggle(): void {
    if (this.hasChildren()) this.expanded.set(!this.expanded());
  }
}
