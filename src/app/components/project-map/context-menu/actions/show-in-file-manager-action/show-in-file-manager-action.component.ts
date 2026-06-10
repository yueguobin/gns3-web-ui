import { ChangeDetectionStrategy, Component, EventEmitter, Output, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Node } from '../../../../../cartography/models/node';
import { Controller } from '@models/controller';

@Component({
  standalone: true,
  selector: 'app-show-in-file-manager-action',
  templateUrl: './show-in-file-manager-action.component.html',
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShowInFileManagerActionComponent {
  @Output() openFileManagerInline = new EventEmitter<{ node: Node; controller: Controller }>();

  readonly node = input<Node>(undefined);
  readonly controller = input<Controller>(undefined);

  showInFileManager() {
    const node = this.node();
    const controller = this.controller();
    if (node && controller) {
      this.openFileManagerInline.emit({ node, controller });
    }
  }
}
