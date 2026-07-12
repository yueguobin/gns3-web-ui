import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { Link } from '@models/link';
import { Project } from '@models/project';
import { Controller } from '@models/controller';
import { DialogConfigService } from '@services/dialog-config.service';
import { MarkerTrafficInsightComponent } from '../../../marker-traffic-insight/marker-traffic-insight.component';

@Component({
  selector: 'app-traffic-insight-action',
  templateUrl: './traffic-insight-action.component.html',
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrafficInsightActionComponent {
  private dialog = inject(MatDialog);
  private dialogConfig = inject(DialogConfigService);

  readonly controller = input<Controller>(undefined);
  readonly project = input<Project>(undefined);
  readonly link = input<Link>(undefined);

  openTrafficInsight() {
    const dialogConfig = this.dialogConfig.openConfig('trafficInsight', {
      autoFocus: false,
      disableClose: false,
    });
    const dialogRef = this.dialog.open(MarkerTrafficInsightComponent, dialogConfig);
    const instance = dialogRef.componentInstance;
    instance.controller = this.controller();
    instance.project = this.project();
    instance.link = this.link();
    instance.init();
  }
}
