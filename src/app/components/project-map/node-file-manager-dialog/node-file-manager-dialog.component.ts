import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ClipboardModule, Clipboard } from '@angular/cdk/clipboard';

export interface NodeFileManagerDialogData {
  nodeName: string;
  nodeDirectory: string;
  controllerName: string;
}

@Component({
  standalone: true,
  selector: 'app-node-file-manager-dialog',
  templateUrl: './node-file-manager-dialog.component.html',
  styleUrls: ['./node-file-manager-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatTooltipModule, ClipboardModule],
})
export class NodeFileManagerDialogComponent {
  copied = false;

  constructor(
    public dialogRef: MatDialogRef<NodeFileManagerDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: NodeFileManagerDialogData,
    private clipboard: Clipboard
  ) {}

  copyPath() {
    this.clipboard.copy(this.data.nodeDirectory);
    this.copied = true;
    setTimeout(() => (this.copied = false), 2000);
  }

  onCloseClick() {
    this.dialogRef.close();
  }
}
