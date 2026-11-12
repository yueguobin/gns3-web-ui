import { ChangeDetectionStrategy, Component, Inject, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { Project, ProjectDistribution, ProjectDistributionStatus } from '@models/project';
import { Controller } from '@models/controller';
import { ProjectService } from '@services/project.service';

/**
 * History of a project's distributions: one entry per persisted
 * distribution job (newest first). The records are an event log — a copy
 * that was later deleted still counts — so the dialog states history, not
 * the current number of live copies.
 */
@Component({
  selector: 'app-distribution-history-dialog',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './distribution-history-dialog.component.html',
  styleUrl: './distribution-history-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DistributionHistoryDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<DistributionHistoryDialogComponent>);
  private readonly projectService = inject(ProjectService);

  /** Distribution jobs, or null while loading. */
  readonly records = signal<ProjectDistribution[] | null>(null);
  readonly loadFailed = signal(false);

  constructor(@Inject(MAT_DIALOG_DATA) public data: DistributionHistoryDialogData) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loadFailed.set(false);
    this.records.set(null);
    this.projectService.listDistributions(this.data.controller, this.data.project.project_id).subscribe({
      next: (jobs) => this.records.set(jobs),
      error: () => this.loadFailed.set(true),
    });
  }

  /** Copies that actually exist for a job: results with a non-null project. */
  successfulCopies(job: ProjectDistribution): number {
    return job.results.filter((result) => result.project !== null).length;
  }

  /** Whether a distributed copy has been deleted since (unknown = no). */
  copyDeleted(result: { project: Project | null; project_exists?: boolean | null }): boolean {
    return result.project !== null && result.project_exists === false;
  }

  recipientTooltip(result: { project: Project | null; project_exists?: boolean | null; error: { message: string } | null }): string {
    if (!result.project) return result.error?.message || 'Failed';
    if (this.copyDeleted(result)) return 'Copy deleted';
    return 'Open the copy';
  }

  /**
   * Cancel (running) or delete the record of (finished) one distribution —
   * the same endpoint either way. A response body means the job was running
   * and got cancelled (update in place); null means the record was deleted
   * (reload). Errors also reload: the list then reflects the true state.
   */
  removeJob(job: ProjectDistribution): void {
    this.projectService
      .deleteDistribution(this.data.controller, this.data.project.project_id, job.distribution_id)
      .subscribe({
        next: (updated) => {
          if (updated) {
            this.records.update((jobs) =>
              jobs.map((candidate) => (candidate.distribution_id === updated.distribution_id ? updated : candidate))
            );
          } else {
            this.load();
          }
        },
        error: () => this.load(),
      });
  }

  statusLabel(status: ProjectDistributionStatus): string {
    switch (status) {
      case 'running':
        return 'Running';
      case 'cancelling':
        return 'Cancelling';
      case 'cancelled':
        return 'Cancelled';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
    }
  }

  close(): void {
    this.dialogRef.close();
  }
}

export interface DistributionHistoryDialogData {
  controller: Controller;
  project: Project;
}
