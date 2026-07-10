import {
  Component,
  Inject,
  OnInit,
  Renderer2,
  inject,
  signal,
  ChangeDetectionStrategy,
  OnDestroy,
} from '@angular/core';
import { MatSnackBarRef, MAT_SNACK_BAR_DATA } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Subscription } from 'rxjs';
import { UploadServiceService } from './upload-service.service';

@Component({
  selector: 'app-uploading-processbar',
  templateUrl: './uploading-processbar.component.html',
  styleUrl: './uploading-processbar.component.scss',
  imports: [MatButtonModule, MatProgressBarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadingProcessbarComponent implements OnInit, OnDestroy {
  private _snackRef = inject(MatSnackBarRef<UploadingProcessbarComponent>);
  private _US = inject(UploadServiceService);

  uploadProgress = signal<number>(0);
  label = signal<string>('');
  isComputing = signal<boolean>(false);
  subscription: Subscription;
  upload_file_type: string;

  constructor(@Inject(MAT_SNACK_BAR_DATA) public data) {}

  ngOnInit() {
    this.upload_file_type = this.data.upload_file_type;
    this.subscription = this._US.currentCount.subscribe((count: number) => {
      this.uploadProgress.set(count);
      // `null` always dismisses (cancel path for all consumers).
      // `100` only dismisses when not in the local-compute (e.g. MD5) phase,
      // otherwise the bar would close before the real upload starts.
      if (this.uploadProgress() == null || (this.uploadProgress() === 100 && !this.isComputing())) {
        this.dismiss();
      }
    });
    this.subscription.add(this._US.currentMessage.subscribe((msg: string) => this.label.set(msg)));
    this.subscription.add(this._US.currentComputing.subscribe((v: boolean) => this.isComputing.set(v)));
  }

  dismiss() {
    this._snackRef.dismiss();
  }

  cancelItem() {
    this._US.cancelFileUploading(true);
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
}
