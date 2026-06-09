import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  OnDestroy,
  OnInit,
  Output,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Subject, fromEvent, animationFrameScheduler } from 'rxjs';
import { takeUntil, tap, switchMap, auditTime } from 'rxjs/operators';
import { ResizeEvent, ResizableDirective, ResizeHandleDirective } from 'angular-resizable-element';
import { Node } from '../../../cartography/models/node';
import { Controller } from '@models/controller';
import { NodeFileManagerPageComponent } from '../node-file-manager-page/node-file-manager-page.component';
import { WindowBoundaryService, WindowStyle } from '@services/window-boundary.service';
import { WindowManagementService } from '@services/window-management.service';

@Component({
  standalone: true,
  selector: 'app-node-file-manager-inline',
  templateUrl: './node-file-manager-inline.component.html',
  styleUrl: './node-file-manager-inline.component.scss',
  imports: [CommonModule, MatIconModule, MatButtonModule, ResizableDirective, ResizeHandleDirective, NodeFileManagerPageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NodeFileManagerInlineComponent implements OnInit, OnDestroy {
  private readonly DEFAULT_WIDTH = 900;
  private readonly DEFAULT_HEIGHT = 600;
  private readonly DEFAULT_LEFT = '120px';
  private readonly DEFAULT_TOP = '80px';
  private readonly MIN_WIDTH = 600;
  private readonly MIN_HEIGHT = 400;

  private destroy$ = new Subject<void>();
  readonly node = input<Node>();
  readonly controller = input<Controller>();
  readonly zIndex = input<number>(1000);

  @Output() closeWindow = new EventEmitter<void>();
  @Output() windowFocused = new EventEmitter<void>();

  public style: WindowStyle = {
    position: 'fixed',
    left: this.DEFAULT_LEFT,
    top: this.DEFAULT_TOP,
    width: `${this.DEFAULT_WIDTH}px`,
    height: `${this.DEFAULT_HEIGHT}px`,
  };

  public resizedWidth = this.DEFAULT_WIDTH;
  public resizedHeight = this.DEFAULT_HEIGHT;

  private isDraggingSignal = signal(false);
  private isResizingSignal = signal(false);
  private isMinimizedSignal = signal(false);

  public readonly isDragging = this.isDraggingSignal.asReadonly();
  public readonly isResizing = this.isResizingSignal.asReadonly();
  public readonly isMinimized = this.isMinimizedSignal.asReadonly();

  private boundaryService = inject(WindowBoundaryService);
  private windowManagement = inject(WindowManagementService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartLeft = 0;
  private dragStartTop = 0;

  readonly windowWrapper = viewChild<ElementRef>('windowWrapper');

  constructor() {
    effect(() => {
      const node = this.node();
      if (!node) return;
      const id = this.getWindowId();
      const minimized = this.windowManagement.minimizedWindows();
      if (minimized.some(w => w.id === id) && !this.isMinimizedSignal()) {
        this.isMinimizedSignal.set(true);
      } else if (!minimized.some(w => w.id === id) && this.isMinimizedSignal()) {
        this.isMinimizedSignal.set(false);
      }
    });
  }

  ngOnInit() {
    const toolbarHeight = window.innerWidth <= 768 ? 56 : 64;
    this.boundaryService.setConfig({ topOffset: toolbarHeight });
    this.setupDragHandling();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private getWindowId(): string {
    return `filemgr-${this.node()?.node_id}`;
  }

  close(): void {
    this.windowManagement.restoreWindow(this.getWindowId());
    this.closeWindow.emit();
  }

  toggleMinimize(): void {
    const node = this.node();
    if (!node) return;
    this.windowManagement.toggleMinimize(this.getWindowId(), 'filemgr');
    this.cdr.markForCheck();
  }

  onWindowFocus(): void {
    if (this.isMinimizedSignal()) {
      this.toggleMinimize();
      return;
    }
    this.windowFocused.emit();
    this.cdr.markForCheck();
  }

  validate(event: ResizeEvent): boolean {
    if (
      event.rectangle.width &&
      event.rectangle.height &&
      (event.rectangle.width < this.MIN_WIDTH || event.rectangle.height < this.MIN_HEIGHT)
    ) {
      return false;
    }
    return true;
  }

  onResizeStart(): void {
    this.isResizingSignal.set(true);
    this.setContentPointerEvents('none');
    this.cdr.markForCheck();
  }

  onResizeEnd(event: ResizeEvent): void {
    const constrained = this.boundaryService.constrainResizeSize(
      event.rectangle.width || this.resizedWidth,
      event.rectangle.height || this.resizedHeight,
      event.rectangle.left,
      event.rectangle.top
    );

    this.style = {
      position: 'fixed',
      left: `${constrained.left}px`,
      top: `${constrained.top}px`,
      width: `${constrained.width}px`,
      height: `${constrained.height}px`,
    };

    this.resizedWidth = constrained.width;
    this.resizedHeight = constrained.height;

    this.isResizingSignal.set(false);
    this.setContentPointerEvents('');
    this.cdr.markForCheck();
  }

  private setupDragHandling(): void {
    const windowElement = this.windowWrapper()?.nativeElement;
    if (!windowElement) return;

    const headerElement = windowElement.querySelector('.node-file-manager-inline-header') as HTMLElement;
    if (!headerElement) return;

    const mouseDown$ = fromEvent<MouseEvent>(headerElement, 'mousedown');
    const mouseMove$ = fromEvent<MouseEvent>(document, 'mousemove');
    const mouseUp$ = fromEvent<MouseEvent>(document, 'mouseup');

    mouseDown$
      .pipe(
        takeUntil(this.destroy$),
        tap((e) => {
          e.preventDefault();
          this.isDraggingSignal.set(true);
          this.cdr.markForCheck();

          this.dragStartX = e.clientX;
          this.dragStartY = e.clientY;
          this.dragStartLeft = Number(this.style.left?.toString().split('px')[0]) || 0;
          this.dragStartTop = Number(this.style.top?.toString().split('px')[0]) || 0;

          this.setContentPointerEvents('none');
        }),
        switchMap(() =>
          mouseMove$.pipe(
            auditTime(0, animationFrameScheduler),
            takeUntil(
              mouseUp$.pipe(
                tap(() => {
                  this.onDragEnd();
                })
              )
            )
          )
        )
      )
      .subscribe((mouseMoveEvent: MouseEvent) => {
        const dx = mouseMoveEvent.clientX - this.dragStartX;
        const dy = mouseMoveEvent.clientY - this.dragStartY;

        let newLeft = this.dragStartLeft + dx;
        let newTop = this.dragStartTop + dy;

        this.style = {
          position: 'fixed',
          left: `${newLeft}px`,
          top: `${newTop}px`,
          width: this.style.width,
          height: this.style.height,
        };

        this.cdr.markForCheck();
      });
  }

  private onDragEnd(): void {
    this.isDraggingSignal.set(false);
    this.setContentPointerEvents('');
    this.cdr.markForCheck();
  }

  private setContentPointerEvents(value: string): void {
    const windowElement = this.windowWrapper()?.nativeElement;
    if (!windowElement) return;
    const page = windowElement.querySelector('app-node-file-manager-page') as HTMLElement;
    if (page) {
      page.style.pointerEvents = value;
    }
  }

  openInNewTab(): void {
    const node = this.node();
    const controller = this.controller();
    if (!node || !controller) return;

    const url = this.router.createUrlTree([
      '/controller',
      controller.id,
      'project',
      node.project_id,
      'nodes',
      node.node_id,
      'files'
    ], {
      queryParams: {
        name: node.name
      }
    });

    const fullUrl = window.location.origin + this.router.serializeUrl(url);
    window.open(fullUrl, '_blank');
  }
}
