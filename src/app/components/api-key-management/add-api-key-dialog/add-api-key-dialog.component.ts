import { ChangeDetectionStrategy, Component, inject, model } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-add-api-key-dialog',
  standalone: true,
  templateUrl: './add-api-key-dialog.component.html',
  styleUrl: './add-api-key-dialog.component.scss',
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddApiKeyDialogComponent {
  private dialogRef = inject(MatDialogRef<AddApiKeyDialogComponent>);

  readonly name = model('');

  onCancel() {
    this.dialogRef.close();
  }

  onSubmit() {
    const trimmed = this.name().trim();
    if (!trimmed) return;
    this.dialogRef.close(trimmed);
  }
}
