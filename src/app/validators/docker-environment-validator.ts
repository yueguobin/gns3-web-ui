import { Injectable, inject } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { DockerValidationService } from '@services/docker-validation.service';

@Injectable()
export class EnvironmentValidator {
  private validationService = inject(DockerValidationService);

  /**
   * Validates environment variables format for Reactive Forms.
   * Delegates to DockerValidationService for consistency.
   *
   * @param control - form control containing environment variables (one per line)
   * @returns validation error object if invalid, null if valid
   */
  get(control: AbstractControl | { value: string }) {
    const value = control.value as string;
    const error = this.validationService.validateEnvironment(value);

    if (error) {
      return {
        invalidEnvironmentFormat: true,
        ...error,
      };
    }

    return null;
  }
}
