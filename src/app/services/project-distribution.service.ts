import { Injectable, inject, signal } from '@angular/core';
import { Subscription, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { Controller } from '@models/controller';
import { ProjectDistribution } from '@models/project';
import { ProjectService } from '@services/project.service';
import { UserPreferencesService } from '@services/user-preferences.service';
import { NotificationCenterService } from '@services/notification-center.service';

/**
 * localStorage key mirrored to the controller's per-user preferences
 * document. The value holds pointers to RUNNING server-side jobs only:
 * a ref is dropped the moment its job reaches a terminal state, so stale
 * refs can only exist when a session died mid-run. Restoring such a ref
 * hits 404 (server restart or retention cleanup) and prunes itself.
 */
const ACTIVE_DISTRIBUTIONS_STORAGE_KEY = 'gns3-active-distributions';

const POLL_INTERVAL_MS = 1000;

/** A distribution job shown in the corner widget. */
export interface TrackedDistribution {
  controller: Controller;
  /** Latest known job state. */
  job: ProjectDistribution;
  /** The server no longer remembers the job (restart or retention cleanup). */
  expired: boolean;
}

/** Persisted pointer to a running job, so another browser can resume tracking it. */
interface StoredDistributionRef {
  controller_id: number;
  project_id: string;
  distribution_id: string;
  name: string;
  total: number;
}

/**
 * Tracks server-side project distribution jobs and polls their progress.
 *
 * Dismissing a card only stops the tracking: the server job runs to
 * completion on its own (there is no abort endpoint).
 */
@Injectable({ providedIn: 'root' })
export class ProjectDistributionService {
  private readonly projectService = inject(ProjectService);
  private readonly userPreferences = inject(UserPreferencesService);
  private readonly notifications = inject(NotificationCenterService);

  private readonly trackedState = signal<TrackedDistribution[]>([]);
  /** Poll subscription per distribution_id (running jobs only). */
  private readonly pollers = new Map<string, Subscription>();
  private readonly restoredControllers = new Set<number>();

  /** Jobs to render in the corner widget, oldest first. */
  readonly tracked = this.trackedState.asReadonly();

  /** Starts tracking a job returned by a distribute call or found in the project's job list. */
  track(controller: Controller, job: ProjectDistribution): void {
    if (this.trackedState().some((entry) => entry.job.distribution_id === job.distribution_id)) {
      return;
    }
    if (job.status !== 'running') {
      // A finished job adopted after the fact: only its outcome is news.
      this.pushSummary(job);
      return;
    }
    const entry: TrackedDistribution = { controller, job, expired: false };
    this.trackedState.update((entries) => [...entries, entry]);
    this.writeRef(entry);
    this.startPolling(entry);
  }

  /**
   * Resumes tracking the running jobs referenced by the stored refs for
   * this controller. Called on login: jobs still running come back as
   * cards, finished ones only push their missed outcome notification and
   * forgotten ones (404/403) are pruned silently.
   */
  restore(controller: Controller): void {
    if (!controller || this.restoredControllers.has(controller.id)) {
      return;
    }
    this.restoredControllers.add(controller.id);
    for (const ref of this.readRefs().filter((candidate) => candidate.controller_id === controller.id)) {
      this.projectService.getDistribution(controller, ref.project_id, ref.distribution_id).subscribe({
        next: (job) => this.track(controller, job),
        error: () => this.pruneRef(ref.distribution_id),
      });
    }
  }

  /** Removes the card and stops polling (the server job keeps running). */
  dismiss(distribution_id: string): void {
    this.stopPolling(distribution_id);
    this.trackedState.update((entries) => entries.filter((entry) => entry.job.distribution_id !== distribution_id));
    this.pruneRef(distribution_id);
  }

  private startPolling(entry: TrackedDistribution): void {
    const id = entry.job.distribution_id;
    this.stopPolling(id);
    this.pollers.set(
      id,
      timer(POLL_INTERVAL_MS, POLL_INTERVAL_MS)
        .pipe(switchMap(() => this.projectService.getDistribution(entry.controller, entry.job.project_id, id)))
        .subscribe({
          next: (job) => this.onPolled(id, job),
          error: (err) => this.onPollError(id, err),
        })
    );
  }

  private stopPolling(distribution_id: string): void {
    this.pollers.get(distribution_id)?.unsubscribe();
    this.pollers.delete(distribution_id);
  }

  private onPolled(distribution_id: string, job: ProjectDistribution): void {
    this.trackedState.update((entries) =>
      entries.map((entry) => (entry.job.distribution_id === distribution_id ? { ...entry, job } : entry))
    );
    if (job.status !== 'running') {
      this.stopPolling(distribution_id);
      this.pruneRef(distribution_id);
      this.pushSummary(job);
    }
  }

  private onPollError(distribution_id: string, err: unknown): void {
    const status = (err as { originalError?: { status?: number } })?.originalError?.status;
    if (status === 404 || status === 403) {
      // 404: the job record is gone (server restart or retention cleanup) —
      // copies already created are real projects and stay with their owners.
      // 403: a ref left behind by another account on this browser.
      this.stopPolling(distribution_id);
      this.pruneRef(distribution_id);
      this.trackedState.update((entries) =>
        entries.map((entry) => (entry.job.distribution_id === distribution_id ? { ...entry, expired: true } : entry))
      );
    }
    // Other errors (controller briefly unreachable): keep polling.
  }

  private pushSummary(job: ProjectDistribution): void {
    if (job.status === 'failed') {
      this.notifications.add('error', `Distribution of "${job.name}" failed: ${job.error?.message ?? 'unknown error'}`);
      return;
    }
    const failed = job.results.filter((result) => !result.project);
    if (failed.length === 0 && job.results.length === 1) {
      const result = job.results[0];
      this.notifications.add(
        'success',
        `Distributed "${result.project?.name ?? job.name}" to ${result.username}. The copy belongs to ${result.username} and will not appear in your projects.`
      );
    } else if (failed.length === 0) {
      this.notifications.add(
        'success',
        `Distributed "${job.name}" to ${job.results.length} users. Each copy is named "${job.name}-{username}", belongs to its recipient and will not appear in your projects.`
      );
    } else {
      this.notifications.add(
        'warning',
        `Distributed "${job.name}" to ${job.results.length - failed.length} of ${job.total} users. Failed: ${failed
          .map((result) => result.username)
          .join(', ')}.`
      );
    }
  }

  private writeRef(entry: TrackedDistribution): void {
    const ref: StoredDistributionRef = {
      controller_id: entry.controller.id,
      project_id: entry.job.project_id,
      distribution_id: entry.job.distribution_id,
      name: entry.job.name,
      total: entry.job.total,
    };
    const refs = this.readRefs().filter((candidate) => candidate.distribution_id !== ref.distribution_id);
    this.userPreferences.setItem(ACTIVE_DISTRIBUTIONS_STORAGE_KEY, JSON.stringify([...refs, ref]));
  }

  private pruneRef(distribution_id: string): void {
    const refs = this.readRefs().filter((candidate) => candidate.distribution_id !== distribution_id);
    this.userPreferences.setItem(ACTIVE_DISTRIBUTIONS_STORAGE_KEY, JSON.stringify(refs));
  }

  private readRefs(): StoredDistributionRef[] {
    try {
      const parsed = JSON.parse(this.userPreferences.getItem(ACTIVE_DISTRIBUTIONS_STORAGE_KEY) ?? '[]');
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter(
        (ref): ref is StoredDistributionRef =>
          typeof ref?.controller_id === 'number' &&
          typeof ref?.project_id === 'string' &&
          typeof ref?.distribution_id === 'string' &&
          typeof ref?.name === 'string' &&
          typeof ref?.total === 'number'
      );
    } catch {
      return [];
    }
  }
}
