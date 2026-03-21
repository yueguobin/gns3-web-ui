import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnInit, inject} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ReactiveFormsModule, UntypedFormControl, UntypedFormGroup, Validators} from "@angular/forms";
import {User} from "@models/users/user";
import {MAT_DIALOG_DATA, MatDialogRef, MatDialogModule} from "@angular/material/dialog";
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {UserService} from "@services/user.service";
import {Controller} from "@models/controller";
import {ToasterService} from "@services/toaster.service";
import {matchingPassword} from "@components/user-management/ConfirmPasswordValidator";

@Component({
  standalone: true,
  selector: 'app-change-user-password',
  templateUrl: './change-user-password.component.html',
  styleUrls: ['./change-user-password.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule]
})
export class ChangeUserPasswordComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<ChangeUserPasswordComponent>);
  private userService = inject(UserService);
  private toasterService = inject(ToasterService);
  private cd = inject(ChangeDetectorRef);

  @Inject(MAT_DIALOG_DATA) public data: { user: User, controller: Controller, self_update: boolean };

  editPasswordForm: UntypedFormGroup;
  user: User;

  constructor() { }

  ngOnInit(): void {
    const password_regex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/;
    this.user = this.data.user;
    this.editPasswordForm = new UntypedFormGroup({
      password: new UntypedFormControl(null,
        [Validators.minLength(6), Validators.maxLength(100), Validators.pattern(password_regex), Validators.required] ),
      confirmPassword: new UntypedFormControl(null,
        [Validators.minLength(6), Validators.maxLength(100), Validators.pattern(password_regex), Validators.required] ),
    },{
      validators: [matchingPassword]
    });
    // Zoneless compatible: ensure form value changes trigger change detection
    this.editPasswordForm.valueChanges.subscribe(() => this.cd.markForCheck());
  }

  get passwordForm() {
    return this.editPasswordForm.controls;
  }


  onCancel() {
    this.dialogRef.close();
  }

  onPasswordSave() {
    if (!this.editPasswordForm.valid) {
      return;
    }

    const updatedUser = {};
    updatedUser['password'] = this.editPasswordForm.get('password').value;
    updatedUser['user_id'] = this.user.user_id;

    this.userService.update(this.data.controller, updatedUser, this.data.self_update)
      .subscribe((user: User) => {
          this.toasterService.success(`User ${user.username} password updated`);
          this.editPasswordForm.reset();
          this.dialogRef.close(true);
        },
        (error) => {
          this.toasterService.error('Cannot update password for user: ' + error);
        })
  }
}
