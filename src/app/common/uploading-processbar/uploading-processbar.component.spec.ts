import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBarRef, MAT_SNACK_BAR_DATA } from '@angular/material/snack-bar';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadingProcessbarComponent } from './uploading-processbar.component';
import { UploadServiceService } from './upload-service.service';

describe('UploadingProcessbarComponent', () => {
  let fixture: ComponentFixture<UploadingProcessbarComponent>;
  let component: UploadingProcessbarComponent;
  let uploadService: UploadServiceService;
  let dismissSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    dismissSpy = vi.fn();
    await TestBed.configureTestingModule({
      imports: [UploadingProcessbarComponent],
      providers: [
        UploadServiceService,
        { provide: MAT_SNACK_BAR_DATA, useValue: { upload_file_type: 'Image' } },
        { provide: MatSnackBarRef, useValue: { dismiss: dismissSpy } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UploadingProcessbarComponent);
    component = fixture.componentInstance;
    uploadService = TestBed.inject(UploadServiceService);
    fixture.detectChanges(); // triggers ngOnInit → subscribes to the service streams
  });

  afterEach(() => {
    if (fixture) {
      fixture.destroy();
    }
  });

  it('falls back to the legacy label when no message is pushed', () => {
    const p = fixture.nativeElement.querySelector('p');
    expect(p.textContent).toContain('Image Uploading please wait');
  });

  it('renders the pushed message as the label instead of the legacy text', () => {
    uploadService.setMessage('Computing checksum');
    fixture.detectChanges();
    const p = fixture.nativeElement.querySelector('p');
    expect(p.textContent).toContain('Computing checksum');
    expect(p.textContent).not.toContain('Uploading please wait');
  });

  it('does not dismiss at 100 while computing (MD5 phase)', () => {
    uploadService.setComputing(true);
    uploadService.processBarCount(100);
    expect(dismissSpy).not.toHaveBeenCalled();
  });

  it('dismisses at 100 when not computing (backward compat with the other uploaders)', () => {
    uploadService.processBarCount(100);
    expect(dismissSpy).toHaveBeenCalled();
  });

  it('dismisses on null regardless of computing (cancel path for all consumers)', () => {
    uploadService.setComputing(true);
    uploadService.processBarCount(null);
    expect(dismissSpy).toHaveBeenCalled();
  });

  it('reflects the computed progress value', () => {
    uploadService.processBarCount(42);
    expect(component.uploadProgress()).toBe(42);
  });
});
