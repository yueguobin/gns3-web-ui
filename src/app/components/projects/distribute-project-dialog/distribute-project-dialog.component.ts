import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatChipsModule } from '@angular/material/chips';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { forkJoin, of } from 'rxjs';
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
    MatAutocompleteModule,
    MatChipsModule,
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
  readonly resetMacAddresses = signal(true);
  readonly isLoadingTargets = signal(true);
  readonly targetsLoadError = signal('');
  readonly isSubmitting = signal(false);
  /** Per-recipient outcomes of the last multi-user / group submission. */
  readonly results = signal<ProjectDistributionResult[]>([]);

  // Autocomplete filter text (free-typed, only picks from the panel count).
  readonly userFilter = signal('');
  readonly usersFilter = signal('');
  readonly groupFilter = signal('');

  // Effective selections (a selection only happens via optionSelected).
  readonly selectedUser = signal<User | null>(null);
  readonly selectedUsers = signal<User[]>([]);
  readonly selectedGroup = signal<Group | null>(null);

  readonly filteredUsers = computed(() => this.filterUsers(this.userFilter()));
  readonly filteredUsersToAdd = computed(() =>
    this.filterUsers(this.usersFilter()).filter(
      (user) => !this.selectedUsers().some((selected) => selected.user_id === user.user_id)
    )
  );
  readonly filteredGroups = computed(() => {
    const filter = this.groupFilter().toLowerCase();
    return this.groups().filter((group) => group.name.toLowerCase().includes(filter));
  });

  /** Copies are automatically suffixed with the recipient's username except in single-user mode. */
  readonly nameGetsSuffix = computed(() => this.targetMode() !== 'user');

  readonly canSubmit = computed(() => {
    if (this.isSubmitting() || !this.copyName().trim()) {
      return false;
    }
    switch (this.targetMode()) {
      case 'user':
        return this.selectedUser() !== null;
      case 'users':
        return this.selectedUsers().length > 0;
      case 'group':
        return this.selectedGroup() !== null;
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

  displayUsername = (user: User | null): string => user?.username ?? '';
  displayGroupName = (group: Group | null): string => group?.name ?? '';

  onUserFilterInput(value: string): void {
    this.userFilter.set(value);
    if (this.selectedUser() && value !== this.selectedUser()!.username) {
      this.selectedUser.set(null);
    }
  }

  onGroupFilterInput(value: string): void {
    this.groupFilter.set(value);
    if (this.selectedGroup() && value !== this.selectedGroup()!.name) {
      this.selectedGroup.set(null);
    }
  }

  selectUser(user: User): void {
    this.selectedUser.set(user);
    this.userFilter.set(user.username);
  }

  addUser(user: User): void {
    this.selectedUsers.update((previous) =>
      previous.some((selected) => selected.user_id === user.user_id) ? previous : [...previous, user]
    );
    this.usersFilter.set('');
  }

  removeUser(user: User): void {
    this.selectedUsers.update((previous) => previous.filter((selected) => selected.user_id !== user.user_id));
  }

  selectGroup(group: Group): void {
    this.selectedGroup.set(group);
    this.groupFilter.set(group.name);
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
    switch (this.targetMode()) {
      case 'user':
        this.projectService
          .distribute(this.controller, this.project.project_id, name, {
            target_user: this.selectedUser()?.username,
            reset_mac_addresses: reset,
          })
          .subscribe(this.distributeObserver());
        break;
      case 'users':
        this.projectService
          .distribute(this.controller, this.project.project_id, name, {
            target_users: this.selectedUsers().map((user) => user.username),
            reset_mac_addresses: reset,
          })
          .subscribe(this.distributeObserver());
        break;
      case 'group':
        this.projectService
          .distribute(this.controller, this.project.project_id, name, {
            target_group: this.selectedGroup()?.name,
            reset_mac_addresses: reset,
          })
          .subscribe(this.distributeObserver());
        break;
    }
  }

  private distributeObserver() {
    return {
      next: (results: ProjectDistributionResult[]) => this.handleResults(results),
      error: (err: unknown) => {
        this.isSubmitting.set(false);
        this.cd.markForCheck();
        this.toasterService.error(err instanceof Error ? err.message : 'Failed to distribute project');
      },
    };
  }

  private handleResults(results: ProjectDistributionResult[]): void {
    this.isSubmitting.set(false);
    this.cd.markForCheck();

    const failed = results.filter((result) => !result.project);
    if (failed.length > 0) {
      this.results.set(results);
      this.cd.markForCheck();
      return;
    }

    const name = this.copyName().trim();
    const suffixHint =
      this.targetMode() === 'group'
        ? ' Members joining the group later will not receive a copy — distribute again for them.'
        : '';
    if (results.length === 1) {
      const username = results[0].username;
      this.toasterService.success(
        `Distributed "${name}" to ${username}. The copy belongs to ${username} and will not appear in your projects.${suffixHint}`
      );
    } else {
      this.toasterService.success(
        `Distributed "${name}" to ${results.length} users. Each copy is named "${name}-{username}", belongs to its recipient and will not appear in your projects.${suffixHint}`
      );
    }
    this.dialogRef.close();
  }

  private filterUsers(filter: string): User[] {
    const value = filter.toLowerCase();
    return this.users().filter(
      (user) => user.username.toLowerCase().includes(value) || (user.full_name ?? '').toLowerCase().includes(value)
    );
  }
}
