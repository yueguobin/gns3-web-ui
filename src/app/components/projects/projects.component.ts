import { SelectionModel } from '@angular/cdk/collections';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  model,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatBottomSheet, MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSort, MatSortModule, Sort } from '@angular/material/sort';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ExportPortableProjectComponent } from '@components/export-portable-project/export-portable-project.component';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ProgressService } from '../../common/progress/progress.service';
import { Project } from '@models/project';
import { Controller } from '@models/controller';
import { ProjectService } from '@services/project.service';
import { NotificationService, ProjectNotification } from '@services/notification.service';
import { RecentlyOpenedProjectService } from '@services/recentlyOpenedProject.service';
import { Settings, SettingsService } from '@services/settings.service';
import { ThemeService } from '@services/theme.service';
import { ToasterService } from '@services/toaster.service';
import { AddBlankProjectDialogComponent } from './add-blank-project-dialog/add-blank-project-dialog.component';
import { ChooseNameDialogComponent } from './choose-name-dialog/choose-name-dialog.component';
import { ConfirmationBottomSheetComponent } from './confirmation-bottomsheet/confirmation-bottomsheet.component';
import { ConfirmationDeleteAllProjectsComponent } from './confirmation-delete-all-projects/confirmation-delete-all-projects.component';
import { EditProjectDialogComponent } from './edit-project-dialog/edit-project-dialog.component';
import { ImportProjectDialogComponent } from './import-project-dialog/import-project-dialog.component';
import { NavigationDialogComponent } from './navigation-dialog/navigation-dialog.component';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { version } from '../../version';

@Component({
  selector: 'app-projects',
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.scss',
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatBottomSheetModule,
    MatDialogModule,
    MatSortModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    ScrollingModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsComponent implements OnInit {
  controller: Controller;
  settings: Settings;
  project: Project;
  displayedColumns = ['select', 'name', 'created_by', 'actions', 'delete'];
  public readonly version = version;
  public readonly currentYear = new Date().getFullYear();
  isAllDelete = false;
  selection = new SelectionModel<Project>(true, []);

  readonly sort = viewChild<MatSort>(MatSort);
  readonly searchText = model('');

  // ── Signal state ──────────────────────────────────────────────
  private _projects = signal<Project[]>([]);
  private _sortActive = signal<string>('name');
  private _sortDirection = signal<'asc' | 'desc' | ''>('asc');
  private _loadingProjects = signal<Set<string>>(new Set());

  // ── Derived: sorted + filtered display data ───────────────────
  readonly displayProjects = computed(() => {
    const search = this.searchText()?.toLowerCase() || '';
    let projects = this._projects();

    // Filter by name or created_by
    if (search) {
      projects = projects.filter(
        p =>
          p.name.toLowerCase().includes(search) ||
          (p.created_by && p.created_by.toLowerCase().includes(search)),
      );
    }

    // Sort
    const active = this._sortActive();
    const direction = this._sortDirection();
    if (active && direction) {
      projects = [...projects].sort((a, b) => {
        const valueA = (a as any)[active];
        const valueB = (b as any)[active];
        const valA = isNaN(+valueA) ? valueA : +valueA;
        const valB = isNaN(+valueB) ? valueB : +valueB;
        return (valA < valB ? -1 : 1) * (direction === 'asc' ? 1 : -1);
      });
    }

    return projects;
  });

  // Bridge to mat-table (material table accepts Observable<T[]>)
  private _displayProjects$ = toObservable(this.displayProjects);
  readonly dataSource = this._displayProjects$;

  // ── Dependencies ──────────────────────────────────────────────
  private destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);
  private projectService = inject(ProjectService);
  private notificationService = inject(NotificationService);
  private settingsService = inject(SettingsService);
  private progressService = inject(ProgressService);
  public dialog = inject(MatDialog);
  private router = inject(Router);
  private bottomSheet = inject(MatBottomSheet);
  private toasterService = inject(ToasterService);
  private recentlyOpenedProjectService = inject(RecentlyOpenedProjectService);
  private themeService = inject(ThemeService);

  ngOnInit() {
    this.controller = this.route.snapshot.data['controller'];
    if (!this.controller) this.router.navigate(['/controllers']);
    this.recentlyOpenedProjectService.setcontrollerIdProjectList(this.controller.id.toString());

    // Handle error queryParam from redirect after project not found (404)
    const errorParam = this.route.snapshot.queryParams['error'];
    if (errorParam) {
      this.toasterService.error(errorParam);
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }

    this.refresh();
    this.sort()?.sort({ id: 'name', start: 'asc' } as any);
    this.settings = this.settingsService.getAll();

    // Subscribe to external refresh requests
    this.projectService.projectListSubject
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refresh());

    // Subscribe to global project notifications for incremental updates
    this.notificationService.projectNotificationEmitter
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((notification: ProjectNotification) => this.handleProjectNotification(notification));
  }

  // ── Sort handler (called from template matSortChange) ─────────
  onSortChange(sortState: Sort) {
    this._sortActive.set(sortState.active);
    this._sortDirection.set(sortState.direction);
  }

  // ── Data fetching ─────────────────────────────────────────────
  refresh() {
    this.projectService.list(this.controller).subscribe({
      next: (projects: Project[]) => {
        this._projects.set(projects);
      },
      error: (err) => {
        const message = err.error?.message || err.message || 'Failed to list projects';
        this.toasterService.error(message);
        this.progressService.setError(err);
      },
    });
  }

  // ── WebSocket notification handler ────────────────────────────
  private handleProjectNotification(notification: ProjectNotification): void {
    this._projects.update(projects => {
      const list = [...projects];
      const index = list.findIndex(p => p.project_id === notification.event.project_id);
      switch (notification.action) {
        case 'project.created':
          if (index === -1) list.push(notification.event);
          break;
        case 'project.updated':
          if (index >= 0) list[index] = notification.event;
          break;
        case 'project.deleted':
          if (index >= 0) list.splice(index, 1);
          break;
      }
      return list;
    });
  }

  // ── Loading state ─────────────────────────────────────────────
  isProjectLoading(projectId: string): boolean {
    return this._loadingProjects().has(projectId);
  }

  private setProjectLoading(projectId: string, loading: boolean): void {
    this._loadingProjects.update(set => {
      const next = new Set(set);
      if (loading) next.add(projectId);
      else next.delete(projectId);
      return next;
    });
  }

  // ── Selection ─────────────────────────────────────────────────
  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this._projects().length;
    return numSelected === numRows;
  }

  selectAllImages() {
    this.isAllSelected() ? this.unChecked() : this.allChecked();
  }

  unChecked() {
    this.selection.clear();
    this.isAllDelete = false;
  }

  allChecked() {
    this._projects().forEach(row => this.selection.select(row));
    this.isAllDelete = true;
  }

  // ── CRUD operations ───────────────────────────────────────────
  delete(project: Project) {
    const bottomSheetRef = this.bottomSheet.open(ConfirmationBottomSheetComponent, {
      data: { message: 'Do you want to delete the project?' },
      panelClass: 'confirmation-bottom-sheet',
    });
    const bottomSheetSubscription = bottomSheetRef.afterDismissed().subscribe((result: boolean) => {
      if (result) {
        this.setProjectLoading(project.project_id, true);
        this.projectService.delete(this.controller, project.project_id).subscribe({
          next: () => {
            this.refresh();
          },
          error: (err) => {
            const message = err.error?.message || err.message || 'Failed to delete project';
            this.toasterService.error(message);
            this.setProjectLoading(project.project_id, false);
          },
          complete: () => {
            this.setProjectLoading(project.project_id, false);
          },
        });
      }
    });
  }

  open(project: Project) {
    this.progressService.activate();

    this.projectService.open(this.controller, project.project_id).subscribe({
      next: () => {
        this.refresh();
      },
      error: (err) => {
        const message = err.error?.message || err.message || 'Project was deleted';
        this.refresh();
        this.progressService.deactivate();
        this.toasterService.error(message);
      },
      complete: () => {
        this.progressService.deactivate();
      },
    });
  }

  close(project: Project) {
    const bottomSheetRef = this.bottomSheet.open(ConfirmationBottomSheetComponent, {
      data: { message: 'Do you want to close the project?' },
      panelClass: 'confirmation-bottom-sheet',
    });
    const bottomSheetSubscription = bottomSheetRef.afterDismissed().subscribe((result: boolean) => {
      if (result) {
        this.setProjectLoading(project.project_id, true);
        this.projectService.close(this.controller, project.project_id).subscribe({
          next: () => {
            this.refresh();
            this.progressService.deactivate();
          },
          error: (err) => {
            const message = err.error?.message || err.message || 'Failed to close project';
            this.toasterService.error(message);
            this.setProjectLoading(project.project_id, false);
            this.progressService.deactivate();
          },
          complete: () => {
            this.setProjectLoading(project.project_id, false);
          },
        });
      }
    });
  }

  duplicate(project: Project) {
    const dialogRef = this.dialog.open(ChooseNameDialogComponent, {
      panelClass: ['base-dialog-panel', 'choose-name-dialog-panel'],
      autoFocus: false,
      disableClose: true,
    });
    let instance = dialogRef.componentInstance;
    instance.controller = this.controller;
    instance.project = project;
    dialogRef.afterClosed().subscribe(() => {
      this.refresh();
    });
  }

  editProject(project: Project) {
    const dialogRef = this.dialog.open(EditProjectDialogComponent, {
      autoFocus: false,
      disableClose: true,
      panelClass: ['base-dialog-panel', 'configurator-dialog-panel', 'edit-project-dialog-panel'],
    });
    let instance = dialogRef.componentInstance;
    instance.controller = this.controller;
    instance.project = project;
    dialogRef.afterClosed().subscribe(() => {
      this.refresh();
    });
  }

  addBlankProject() {
    const dialogRef = this.dialog.open(AddBlankProjectDialogComponent, {
      panelClass: ['base-dialog-panel', 'add-blank-project-dialog-panel'],
      autoFocus: false,
      disableClose: true,
    });
    let instance = dialogRef.componentInstance;
    instance.controller = this.controller;
  }

  importProject() {
    let uuid: string = '';
    const dialogRef = this.dialog.open(ImportProjectDialogComponent, {
      panelClass: ['base-dialog-panel', 'import-project-dialog-panel'],
      autoFocus: false,
      disableClose: true,
    });
    let instance = dialogRef.componentInstance;
    instance.controller = this.controller;
    const subscription = dialogRef.componentInstance.onImportProject.subscribe((projectId: string) => {
      uuid = projectId;
    });

    dialogRef.afterClosed().subscribe(() => {
      this.refresh();
      subscription.unsubscribe();
      if (uuid) {
        this.bottomSheet.open(NavigationDialogComponent);
        let bottomSheetRef = this.bottomSheet._openedBottomSheetRef;
        bottomSheetRef.instance.projectMessage = 'imported project';

        const bottomSheetSubscription = bottomSheetRef.afterDismissed().subscribe((result: boolean) => {
          if (result) {
            this.projectService.open(this.controller, uuid).subscribe({
              next: () => {
                this.router.navigate(['/controller', this.controller.id, 'project', uuid]);
              },
              error: (err) => {
                const message = err.error?.message || err.message || 'Failed to open project';
                this.toasterService.error(message);
              },
            });
          }
        });
      }
    });
  }

  deleteAllFiles() {
    const dialogRef = this.dialog.open(ConfirmationDeleteAllProjectsComponent, {
      panelClass: ['base-confirmation-dialog-panel', 'confirmation-danger-panel', 'delete-all-projects-dialog-panel'],
      autoFocus: false,
      disableClose: true,
      data: {
        controller: this.controller,
        deleteFilesPaths: this.selection.selected,
      },
    });

    dialogRef.afterClosed().subscribe((isAllfilesdeleted: boolean) => {
      if (isAllfilesdeleted) {
        this.unChecked();
        this.refresh();
        this.toasterService.success('All projects deleted');
      } else {
        this.unChecked();
        this.refresh();
        return false;
      }
    });
  }

  exportSelectProject(project: Project) {
    this.project = project;
    if (this.project.project_id) {
      this.exportPortableProjectDialog();
    }
  }

  exportPortableProjectDialog() {
    const dialogRef = this.dialog.open(ExportPortableProjectComponent, {
      panelClass: ['base-dialog-panel', 'simple-dialog-panel'],
      autoFocus: false,
      disableClose: true,
      data: { controllerDetails: this.controller, projectDetails: this.project },
    });

    dialogRef.afterClosed().subscribe(() => {});
  }

  isLightThemeEnabled() {
    return this.themeService.getActualTheme() === 'light';
  }
}
