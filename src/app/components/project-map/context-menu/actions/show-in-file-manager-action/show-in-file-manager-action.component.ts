import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { Node } from '../../../../../cartography/models/node';
import { Controller } from '@models/controller';
import { NodeFileManagerDialogComponent } from '../../../node-file-manager-dialog/node-file-manager-dialog.component';

@Component({
  standalone: true,
  selector: 'app-show-in-file-manager-action',
  templateUrl: './show-in-file-manager-action.component.html',
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShowInFileManagerActionComponent {
  private dialog = inject(MatDialog);

  readonly node = input<Node>(undefined);
  readonly controller = input<Controller>(undefined);

  showInFileManager() {
    const node = this.node();
    const controller = this.controller();
    this.dialog.open(NodeFileManagerDialogComponent, {
      panelClass: ['base-dialog-panel', 'node-file-manager-dialog-panel'],
      autoFocus: false,
      disableClose: false,
      data: {
        nodeName: node.name,
        nodeDirectory: node.node_directory || 'Directory not available (node may not be running)',
        controllerName: controller?.name || controller?.host || 'Unknown server',
      },
    });
  }
}
