import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Link } from '@models/link';
import { Project } from '@models/project';
import { Controller } from '@models/controller';
import { LinkService } from '@services/link.service';
import { MarkerService } from '@services/marker.service';
import { MarkerRegistryService } from '@services/marker-registry.service';
import { LinksDataSource } from '../../../cartography/datasources/links-datasource';
import { MapLinksDataSource } from '../../../cartography/datasources/map-datasource';
import { ToasterService } from '@services/toaster.service';

interface MarkerRow {
  name: string;
  bpf: string;
  tag: number | null;
  color: string | null;
  capture_node_id: string;
}

@Component({
  selector: 'app-marker-traffic-insight',
  templateUrl: './marker-traffic-insight.component.html',
  styleUrl: './marker-traffic-insight.component.scss',
  imports: [
    CommonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatTooltipModule,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkerTrafficInsightComponent {
  private dialogRef = inject(MatDialogRef<MarkerTrafficInsightComponent>);
  private markerService = inject(MarkerService);
  private linkService = inject(LinkService);
  private linksDataSource = inject(LinksDataSource);
  private mapLinksDataSource = inject(MapLinksDataSource);
  private markerRegistryService = inject(MarkerRegistryService);
  private toasterService = inject(ToasterService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  controller: Controller;
  project: Project;
  link: Link;

  readonly markers = signal<MarkerRow[]>([]);
  readonly editingMarker = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  form: FormGroup;

  constructor() {
    this.form = this.fb.group({
      bpf: ['', Validators.required],
      tag: [null],
      name: [''],
      color: [null],
    });
  }

  /**
   * Called by the opener after setting controller / project / link.
   * This two-step pattern avoids the `ngOnInit` timing trap where those
   * properties are still `undefined` during the first change-detection cycle.
   */
  init() {
    this.loadMarkers();
  }

  private loadMarkers() {
    this.markerService.list(this.controller, this.link.project_id, this.link.link_id).subscribe({
      next: (markers) => {
        this.markers.set(
          Object.entries(markers ?? {}).map(([name, m]) => ({
            name,
            bpf: m.bpf,
            tag: m.tag ?? null,
            color: m.color ?? null,
            capture_node_id: m.capture_node_id ?? '',
          }))
        );
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || err.message || 'Failed to load markers');
        this.cdr.markForCheck();
      },
    });
  }

  create() {
    if (this.form.invalid) return;
    this.errorMessage.set(null);
    const body = {
      bpf: this.form.value.bpf,
      tag: this.form.value.tag != null ? Number(this.form.value.tag) : undefined,
      name: this.form.value.name || undefined,
      color: this.form.value.color || undefined,
    };
    this.markerService.create(this.controller, this.link.project_id, this.link.link_id, body).subscribe({
      next: () => {
        this.form.reset({ bpf: '', tag: null, name: '', color: null });
        this.cdr.markForCheck();
        this.refreshLinkAndLoad();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || err.message || 'Failed to create marker');
        this.cdr.markForCheck();
      },
    });
  }

  startEdit(marker: MarkerRow) {
    this.editingMarker.set(marker.name);
    this.errorMessage.set(null);
    this.form.setValue({ bpf: marker.bpf, tag: marker.tag, name: marker.name, color: marker.color });
  }

  cancelEdit() {
    this.editingMarker.set(null);
    this.form.reset({ bpf: '', tag: null, name: '', color: null });
    this.errorMessage.set(null);
    this.cdr.markForCheck();
  }

  saveEdit() {
    if (this.form.invalid) return;
    this.errorMessage.set(null);
    const body = {
      bpf: this.form.value.bpf,
      tag: this.form.value.tag != null ? Number(this.form.value.tag) : undefined,
      name: this.form.value.name || this.editingMarker()!,
      color: this.form.value.color || undefined,
    };
    this.markerService
      .update(this.controller, this.link.project_id, this.link.link_id, this.editingMarker()!, body)
      .subscribe({
        next: () => {
          this.editingMarker.set(null);
          this.form.reset({ bpf: '', tag: null, name: '', color: null });
          this.cdr.markForCheck();
          this.refreshLinkAndLoad();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || err.message || 'Failed to update marker');
          this.cdr.markForCheck();
        },
      });
  }

  deleteMarker(name: string) {
    this.errorMessage.set(null);
    this.markerService.delete(this.controller, this.link.project_id, this.link.link_id, name).subscribe({
      next: () => {
        if (this.editingMarker() === name) {
          this.editingMarker.set(null);
          this.form.reset({ bpf: '', tag: null, name: '', color: null });
          this.cdr.markForCheck();
        }
        this.refreshLinkAndLoad();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || err.message || 'Failed to delete marker');
        this.cdr.markForCheck();
      },
    });
  }

  private refreshLinkAndLoad() {
    this.linkService.getLink(this.controller, this.link.project_id, this.link.link_id).subscribe({
      next: (link) => {
        this.link = link;
        this.linksDataSource.update(link);
        const mapLink = this.mapLinksDataSource.get(link.link_id);
        if (mapLink) {
          mapLink.markers = link.markers;
          this.mapLinksDataSource.update(mapLink);
        }
        this.markerRegistryService.reconcileLink(link);
        this.loadMarkers();
      },
      error: (err) => {
        this.toasterService.error(err.error?.message || err.message || 'Failed to refresh link');
        this.cdr.markForCheck();
      },
    });
  }

  close() {
    this.dialogRef.close();
  }
}
