import { ChangeDetectionStrategy, Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Clipboard } from '@angular/cdk/clipboard';
import { ApiKeyCreatedResponse } from '@models/api/api-key';

export interface ApiKeyDisplayDialogData {
  response: ApiKeyCreatedResponse;
}

@Component({
  selector: 'app-api-key-display-dialog',
  standalone: true,
  templateUrl: './api-key-display-dialog.component.html',
  styleUrl: './api-key-display-dialog.component.scss',
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatSnackBarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApiKeyDisplayDialogComponent {
  private dialogRef = inject(MatDialogRef<ApiKeyDisplayDialogComponent>);
  private snackBar = inject(MatSnackBar);
  private clipboard = inject(Clipboard);

  constructor(@Inject(MAT_DIALOG_DATA) public data: ApiKeyDisplayDialogData) {}

  copyKey() {
    const key = this.data.response.api_key;
    const copied = this.clipboard.copy(key);
    if (copied) {
      this.snackBar.open('API key copied to clipboard', 'Close', { duration: 3000 });
    } else {
      this.snackBar.open('Failed to copy. Please copy the key manually.', 'Close', { duration: 5000 });
    }
  }

  onClose() {
    this.dialogRef.close();
  }
}
