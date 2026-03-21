import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { UntypedFormControl, UntypedFormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ConsoleService } from '@services/settings/console.service';
import { ToasterService } from '@services/toaster.service';

@Component({
  standalone: true,
  selector: 'app-console',
  templateUrl: './console.component.html',
  styleUrls: ['./console.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule],
})
export class ConsoleComponent implements OnInit {
  consoleForm = new UntypedFormGroup({
    command: new UntypedFormControl(''),
  });

  private router = inject(Router);
  private consoleService = inject(ConsoleService);
  private toasterService = inject(ToasterService);
  private cd = inject(ChangeDetectorRef);

  ngOnInit() {
    const commandControl = this.consoleForm.get('command');
    commandControl.setValue(this.consoleService.command);
    // Zoneless compatible: ensure form value changes trigger change detection
    this.consoleForm.valueChanges.subscribe(() => this.cd.markForCheck());
  }

  goBack() {
    this.router.navigate(['/settings']);
  }

  save() {
    const formValue = this.consoleForm.value;
    this.consoleService.command = formValue.command;
    this.toasterService.success('Console command has been updated.');
    this.goBack();
  }
}
