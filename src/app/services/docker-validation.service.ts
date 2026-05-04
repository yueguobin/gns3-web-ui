import { Injectable } from '@angular/core';

export interface ValidationError {
  lineNumber: number;
  message: string;
}

@Injectable({
  providedIn: 'root',
})
export class DockerValidationService {
  /**
   * Validates environment variables format.
   *
   * Rules:
   * - Each line must be in KEY=VALUE format
   * - No spaces allowed around the equals sign
   * - KEY must start with letter or underscore, contain only letters, numbers, underscores
   * - Empty lines are ignored
   *
   * @param value - environment variables (one per line)
   * @returns error message if invalid, null if valid
   */
  validateEnvironment(value: string): ValidationError | null {
    if (!value || value.trim() === '') {
      return null; // Empty is valid
    }

    const lines = value.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines
      if (line === '') {
        continue;
      }

      // Check for spaces around equals sign
      if (line.includes(' =') || line.includes('= ')) {
        return {
          lineNumber: i + 1,
          message: `Line ${i + 1}: No spaces allowed around '=' sign`,
        };
      }

      // Check KEY=VALUE format
      if (!line.includes('=')) {
        return {
          lineNumber: i + 1,
          message: `Line ${i + 1}: Must be in KEY=VALUE format`,
        };
      }

      // Validate KEY naming convention
      const key = line.split('=')[0];
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        return {
          lineNumber: i + 1,
          message: `Line ${i + 1}: Invalid key '${key}'. Must start with letter or underscore, contain only letters, numbers, underscores`,
        };
      }
    }

    return null;
  }

  /**
   * Format validation error for display
   */
  getErrorMessage(error: ValidationError): string {
    return error.message;
  }
}
