import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MarkerRegistryService } from '@services/marker-registry.service';

@Component({
  selector: 'app-marker-legend',
  standalone: true,
  templateUrl: './marker-legend.component.html',
  styleUrl: './marker-legend.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class MarkerLegendComponent {
  private readonly registry = inject(MarkerRegistryService);

  /** Display entries (deduplicated by name, one per unique marker). */
  readonly entries = computed(() => {
    const all = this.registry.entries();
    const seen = new Map<string, string | undefined>();
    for (const entry of all) {
      if (!seen.has(entry.name)) {
        seen.set(entry.name, entry.color);
      }
    }
    const out: { name: string; color: string | undefined }[] = [];
    for (const [name, color] of seen) {
      out.push({ name, color });
    }
    return out;
  });
}
