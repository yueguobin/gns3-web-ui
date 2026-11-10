import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Project, ProjectShare } from '@models/project';
import { Controller } from '@models/controller';
import { User } from '@models/users/user';
import { Group } from '@models/groups/group';
import { ProjectService } from '@services/project.service';
import { UserService } from '@services/user.service';
import { GroupService } from '@services/group.service';
import { ToasterService } from '@services/toaster.service';

type TargetMode = 'user' | 'users' | 'group';

/**
 * Curated share roles (exact server role names). The full role list stays
 * out on purpose: the server rejects roles the sharer does not hold on the
 * project, so a free-form list would only widen the 403 surface.
 */
const SHARE_ROLES: readonly { name: string; description: string }[] = [
  { name: 'Lab member', description: 'Recipients can open and use the project but cannot change its topology.' },
  { name: 'User', description: 'Recipients fully collaborate on the project, topology included.' },
];

@Component({
  selector: 'app-share-project-dialog',
  standalone: true,
  templateUrl: './share-project-dialog.component.html',
  styleUrls: ['./share-project-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatChipsModule,
    MatDividerModule,
    MatTooltipModule,
  ],
})
export class ShareProjectDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<ShareProjectDialogComponent>);
  private readonly projectService = inject(ProjectService);
  private readonly userService = inject(UserService);
  private readonly groupService = inject(GroupService);
  private readonly toasterService = inject(ToasterService);
  private readonly cd = inject(ChangeDetectorRef);

  controller: Controller;
  project: Project;

  readonly shareRoles = SHARE_ROLES;

  readonly targetMode = signal<TargetMode>('user');
  readonly role = signal(SHARE_ROLES[0].name);
  readonly users = signal<User[]>([]);
  readonly groups = signal<Group[]>([]);
  readonly isLoadingTargets = signal(true);
  readonly targetsLoadError = signal('');
  readonly isSubmitting = signal(false);

  readonly shares = signal<ProjectShare[]>([]);
  readonly isLoadingShares = signal(true);
  readonly sharesLoadError = signal('');
  readonly removingAceId = signal<string | null>(null);

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

  readonly roleDescription = computed(
    () => SHARE_ROLES.find((candidate) => candidate.name === this.role())?.description ?? ''
  );

  readonly canSubmit = computed(() => {
    if (this.isSubmitting()) {
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
    this.loadShares();

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
    this.cd.markForCheck();

    const targets =
      this.targetMode() === 'user'
        ? { target_user: this.selectedUser()?.username, role: this.role() }
        : this.targetMode() === 'users'
          ? { target_users: this.selectedUsers().map((user) => user.username), role: this.role() }
          : { target_group: this.selectedGroup()?.name, role: this.role() };

    this.projectService.share(this.controller, this.project.project_id, targets).subscribe({
      next: (shares) => {
        // Sharing is instant (201): summarize, refresh the list and let the
        // dialog stay open for further shares or removals.
        const names = shares.map((share) => share.username ?? share.group_name ?? '');
        const summary = names.length === 1 ? names[0] : `${names.length} recipients`;
        this.toasterService.success(`Shared "${this.project.name}" with ${summary}`);

        this.resetTargets();
        this.isSubmitting.set(false);
        this.loadShares();
      },
      error: (err: unknown) => {
        this.isSubmitting.set(false);
        this.cd.markForCheck();
        this.toasterService.error(err instanceof Error ? err.message : 'Failed to share project');
      },
    });
  }

  removeShare(share: ProjectShare): void {
    if (this.removingAceId() !== null) {
      return;
    }
    this.removingAceId.set(share.ace_id);
    this.cd.markForCheck();

    this.projectService.removeShare(this.controller, this.project.project_id, share.ace_id).subscribe({
      next: () => {
        this.shares.update((previous) => previous.filter((candidate) => candidate.ace_id !== share.ace_id));
        this.removingAceId.set(null);
        this.cd.markForCheck();
      },
      error: (err: unknown) => {
        this.removingAceId.set(null);
        this.cd.markForCheck();
        this.toasterService.error(err instanceof Error ? err.message : 'Failed to remove share');
      },
    });
  }

  private loadShares(): void {
    this.isLoadingShares.set(true);
    this.sharesLoadError.set('');
    this.projectService.listShares(this.controller, this.project.project_id).subscribe({
      next: (shares) => {
        this.shares.set(shares);
        this.isLoadingShares.set(false);
        this.cd.markForCheck();
      },
      error: (err: unknown) => {
        this.isLoadingShares.set(false);
        this.sharesLoadError.set(err instanceof Error ? err.message : 'Failed to load the shares');
        this.cd.markForCheck();
      },
    });
  }

  private resetTargets(): void {
    this.selectedUser.set(null);
    this.selectedUsers.set([]);
    this.selectedGroup.set(null);
    this.userFilter.set('');
    this.usersFilter.set('');
    this.groupFilter.set('');
  }

  private filterUsers(filter: string): User[] {
    const value = filter.toLowerCase();
    return this.users().filter(
      (user) => user.username.toLowerCase().includes(value) || (user.full_name ?? '').toLowerCase().includes(value)
    );
  }
}
