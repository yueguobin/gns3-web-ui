import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Project, ProjectDistributionResult } from '@models/project';
import { Controller } from '@models/controller';
import { User } from '@models/users/user';
import { Group } from '@models/groups/group';
import { ProjectService } from '@services/project.service';
import { UserService } from '@services/user.service';
import { GroupService } from '@services/group.service';
import { ToasterService } from '@services/toaster.service';

type TargetMode = 'user' | 'users' | 'group';

@Component({
  selector: 'app-distribute-project-dialog',
  standalone: true,
  templateUrl: './distribute-project-dialog.component.html',
  styleUrls: ['./distribute-project-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonToggleModule,
    MatCheckboxModule,
  ],
})
export class DistributeProjectDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<DistributeProjectDialogComponent>);
  private readonly projectService = inject(ProjectService);
  private readonly userService = inject(UserService);
  private readonly groupService = inject(GroupService);
  private readonly toasterService = inject(ToasterService);
  private readonly cd = inject(ChangeDetectorRef);

  controller: Controller;
  project: Project;

  readonly copyName = signal('');
  readonly targetMode = signal<TargetMode>('user');
  readonly users = signal<User[]>([]);
  readonly groups = signal<Group[]>([]);
  readonly selectedUserId = signal('');
  readonly selectedUserIds = signal<string[]>([]);
  readonly selectedGroupId = signal('');
  readonly resetMacAddresses = signal(true);
  readonly isLoadingTargets = signal(true);
  readonly targetsLoadError = signal('');
  readonly isSubmitting = signal(false);
  /** Per-recipient outcomes of the last multi-user / group submission. */
  readonly results = signal<ProjectDistributionResult[]>([]);

  readonly selectedGroup = computed(() => this.groups().find((group) => group.user_group_id === this.selectedGroupId()));

  /** Copies are automatically suffixed with the recipient's username except in single-user mode. */
  readonly nameGetsSuffix = computed(() => this.targetMode() !== 'user');

  readonly canSubmit = computed(() => {
    if (this.isSubmitting() || !this.copyName().trim()) {
      return false;
    }
    switch (this.targetMode()) {
      case 'user':
        return Boolean(this.selectedUserId());
      case 'users':
        return this.selectedUserIds().length > 0;
      case 'group':
        return Boolean(this.selectedGroupId());
    }
  });

  ngOnInit() {
    this.copyName.set(this.project.name);
    this.cd.markForCheck();

    forkJoin({
      users: this.userService.list(this.controller).pipe(
        catchError((err) => {
          this.targetsLoadError.set(err.message || 'Failed to load the user list');
          return of([] as User[]);
        })
      ),
      groups: this.groupService.getGroups(this.controller).pipe(catchError(() => of([] as Group[]))),
    }).subscribe(({ users, groups }) => {
      this.users.set(users);
      this.groups.set(groups);
      this.isLoadingTargets.set(false);
      this.cd.markForCheck();
    });
  }

  onCloseClick(): void {
    this.dialogRef.close();
  }

  onSubmitClick(): void {
    if (!this.canSubmit() || this.isSubmitting()) {
      return;
    }
    this.isSubmitting.set(true);
    this.results.set([]);
    this.cd.markForCheck();

    const name = this.copyName().trim();
    const reset = this.resetMacAddresses();
    let request: Observable<Project | ProjectDistributionResult[]>;
    switch (this.targetMode()) {
      case 'user': {
        const user = this.users().find((candidate) => candidate.user_id === this.selectedUserId());
        request = this.projectService.duplicate(this.controller, this.project.project_id, name, {
          target_user: user?.username,
          reset_mac_addresses: reset,
        });
        break;
      }
      case 'users': {
        const usernames = this.users()
          .filter((user) => this.selectedUserIds().includes(user.user_id))
          .map((user) => user.username);
        request = this.projectService.duplicate(this.controller, this.project.project_id, name, {
          target_users: usernames,
          reset_mac_addresses: reset,
        });
        break;
      }
      case 'group': {
        const group = this.selectedGroup();
        request = this.projectService.duplicate(this.controller, this.project.project_id, name, {
          target_group: group?.name,
          reset_mac_addresses: reset,
        });
        break;
      }
    }

    request.subscribe({
      next: (response) => this.handleResponse(response),
      error: (err) => {
        this.isSubmitting.set(false);
        this.cd.markForCheck();
        this.toasterService.error(err.message || 'Failed to distribute project');
      },
    });
  }

  private handleResponse(response: Project | ProjectDistributionResult[]): void {
    this.isSubmitting.set(false);
    this.cd.markForCheck();

    if (Array.isArray(response)) {
      this.handleDistributionResults(response);
      return;
    }

    // Single recipient (or plain copy): the response is the recipient's Project.
    const name = this.copyName().trim();
    const owner = response.created_by || this.targetUsername();
    this.toasterService.success(
      `Distributed "${name}" to ${owner}. The copy belongs to ${owner} and will not appear in your projects.`
    );
    this.dialogRef.close();
  }

  private handleDistributionResults(results: ProjectDistributionResult[]): void {
    const succeeded = results.filter((result) => result.project);
    const failed = results.filter((result) => !result.project);
    const name = this.copyName().trim();

    if (failed.length > 0) {
      this.results.set(results);
      this.cd.markForCheck();
      return;
    }

    const suffixHint = this.targetMode() === 'group' ? ' Members joining the group later will not receive a copy — distribute again for them.' : '';
    if (succeeded.length === 1) {
      this.toasterService.success(
        `Distributed "${name}" to ${succeeded[0].username}. The copy belongs to them and will not appear in your projects.${suffixHint}`
      );
    } else {
      this.toasterService.success(
        `Distributed "${name}" to ${succeeded.length} users. Each copy is named "${name}-{username}", belongs to its recipient and will not appear in your projects.${suffixHint}`
      );
    }
    this.dialogRef.close();
  }

  private targetUsername(): string {
    const user = this.users().find((candidate) => candidate.user_id === this.selectedUserId());
    return user?.username ?? '';
  }
}
