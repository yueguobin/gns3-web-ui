import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AiProfileSchemaFormComponent } from '../ai-profile-schema-form/ai-profile-schema-form.component';

import { Controller } from '@models/controller';
import { AiProfilesService } from '@services/ai-profiles.service';
import { LLMModelConfigResponse, LLMModelConfigWithSource, ProviderSchemaEntry } from '@models/ai-profile';

export interface ConfigDialogData {
  mode: 'create' | 'edit';
  config: LLMModelConfigResponse | LLMModelConfigWithSource | null;
  existingNames: string[];
  /** When provided, the provider schema is fetched from this controller. */
  controller?: Controller;
}

type SchemaState = 'loading' | 'ready' | 'unsupported' | 'empty';

/**
 * Create/edit dialog for LLM model configurations.
 *
 * The form is rendered dynamically from the server's provider schema
 * (GET /v3/access/llm-model-configs/provider-schema). There is no static
 * fallback form: when the schema is not available (old server version,
 * connection error) the dialog shows an explicit unavailable state instead.
 */
@Component({
  selector: 'app-ai-profile-dialog',
  standalone: true,
  templateUrl: './ai-profile-dialog.component.html',
  styleUrl: './ai-profile-dialog.component.scss',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, AiProfileSchemaFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiProfileDialogComponent implements OnInit {
  readonly mode: 'create' | 'edit';
  readonly existingNames: string[];

  readonly schemaState = signal<SchemaState>('loading');
  readonly schemaProviders = signal<ProviderSchemaEntry[]>([]);

  private readonly aiProfilesService = inject(AiProfilesService);
  private readonly dialogRef = inject(MatDialogRef<AiProfileDialogComponent>);
  readonly data = inject(MAT_DIALOG_DATA) as ConfigDialogData;

  constructor() {
    this.mode = this.data.mode;
    this.existingNames = this.data.existingNames;
  }

  ngOnInit(): void {
    this.loadProviderSchema();
  }

  /**
   * Fetch the provider schema. The response is cached per login session in
   * AiProfilesService, so retrying after a failure re-uses a previously
   * successful fetch.
   */
  loadProviderSchema(): void {
    const controller = this.data.controller;
    if (!controller) {
      this.schemaState.set('unsupported');
      return;
    }

    this.schemaState.set('loading');
    this.aiProfilesService.getProviderSchema(controller).subscribe({
      next: (response) => {
        const providers = response?.providers ?? [];
        if (providers.length) {
          this.schemaProviders.set(providers);
          this.schemaState.set('ready');
        } else {
          this.schemaState.set('empty');
        }
      },
      error: () => {
        this.schemaState.set('unsupported');
      },
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
