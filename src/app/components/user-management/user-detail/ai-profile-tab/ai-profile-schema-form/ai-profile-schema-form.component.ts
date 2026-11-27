import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';

import {
  CreateLLMModelConfigRequest,
  LLMModelConfigData,
  LLMModelConfigResponse,
  LLMModelConfigWithSource,
  ProviderCapabilities,
  ProviderConfigField,
  ProviderSchemaEntry,
} from '@models/ai-profile';
import { CONTEXT_STRATEGIES, COPILOT_MODES } from '@utils/ai-profile.util';

/**
 * Capability gates: when a capability is false the provider API rejects the
 * corresponding control, so the field is excluded from rendering AND from the
 * submitted payload (anthropic rejects temperature on every model).
 */
const FIELD_CAPABILITY_GATES: Record<string, keyof ProviderCapabilities> = {
  temperature: 'sampling',
  request_timeout: 'request_controls',
};

const INT_PATTERN = new RegExp('^-?\\d+$');
const FLOAT_PATTERN = new RegExp('^-?\\d+(\\.\\d+)?$');

/**
 * Schema-driven LLM provider config form.
 *
 * Renders exactly the fields declared by
 * GET /v3/access/llm-model-configs/provider-schema for the selected provider
 * (labels, help, placeholders, defaults and options are all server-provided).
 * Shown by AiProfileDialogComponent when the schema endpoint is available;
 * the dialog falls back to its static form otherwise.
 */
@Component({
  selector: 'app-ai-profile-schema-form',
  standalone: true,
  templateUrl: './ai-profile-schema-form.component.html',
  styleUrl: './ai-profile-schema-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
  ],
})
export class AiProfileSchemaFormComponent implements OnInit {
  readonly mode = input.required<'create' | 'edit'>();
  readonly config = input<LLMModelConfigResponse | LLMModelConfigWithSource | null>(null);
  readonly existingNames = input<string[]>([]);
  readonly providers = input.required<ProviderSchemaEntry[]>();

  form!: FormGroup;

  readonly selectedProvider = signal<string>('');
  readonly showAdvanced = signal(false);

  // Only the text model type is supported today (server-side constraint);
  // the config form has no model type selector.
  private static readonly SUPPORTED_MODEL_TYPE = 'text';

  private readonly fb = inject(FormBuilder);
  private readonly cd = inject(ChangeDetectorRef);
  private readonly dialogRef = inject(MatDialogRef);

  /** Schema entry of the selected provider; null for a legacy unknown provider. */
  readonly providerDef = computed(
    () => this.providers().find((provider) => provider.provider === this.selectedProvider()) || null
  );

  /** Provider select options; a legacy unknown provider is kept as an extra entry. */
  readonly providerOptions = computed(() => {
    const options = this.providers().map((provider) => ({
      value: provider.provider,
      label: provider.display_name || provider.provider,
    }));
    const current = this.selectedProvider();
    if (current && !options.some((option) => option.value === current)) {
      options.unshift({ value: current, label: current });
    }
    return options;
  });

  readonly basicFields = computed(() => this.capabilityFilteredFields(this.providerDef()).filter((field) => !field.advanced));
  readonly advancedFields = computed(() => this.capabilityFilteredFields(this.providerDef()).filter((field) => !!field.advanced));
  readonly hasAdvancedFields = computed(() => this.capabilityFilteredFields(this.providerDef()).some((field) => !!field.advanced));

  /** True when editing a config whose provider is not in the schema list. */
  readonly isLegacyProvider = computed(() => this.mode() === 'edit' && this.providerDef() === null);

  ngOnInit(): void {
    const config = this.config();
    const initialProvider =
      this.mode() === 'edit' && config ? config.config.provider : (this.providers()[0]?.provider ?? '');
    this.selectedProvider.set(initialProvider);

    const sourceConfig = this.mode() === 'edit' && config ? config.config : null;
    this.form = this.fb.group({
      name: [
        config?.name ?? '',
        [
          Validators.required,
          Validators.minLength(1),
          Validators.maxLength(100),
          Validators.pattern(/^[a-zA-Z0-9_-]+$/),
          this.duplicateNameValidator(),
        ],
      ],
      is_default: [config?.is_default ?? false],
      configFields: this.buildConfigFields(this.providerDef(), sourceConfig),
    });
  }

  /* ==================== Field model ==================== */

  /**
   * Fields of the provider schema minus the ones excluded by capability flags.
   * Capability-gated fields are dropped from rendering and payload alike.
   */
  private capabilityFilteredFields(def: ProviderSchemaEntry | null): ProviderConfigField[] {
    if (!def) {
      return [];
    }
    return def.fields.filter((field) => {
      const gate = FIELD_CAPABILITY_GATES[field.name];
      return !gate || def.capabilities?.[gate] !== false;
    });
  }

  private buildConfigFields(def: ProviderSchemaEntry | null, sourceConfig: LLMModelConfigData | null): FormGroup {
    const controls: Record<string, AbstractControl> = {};
    for (const field of this.capabilityFilteredFields(def)) {
      controls[field.name] = this.buildFieldControl(field, sourceConfig);
    }
    return this.fb.group(controls);
  }

  private buildFieldControl(field: ProviderConfigField, sourceConfig: LLMModelConfigData | null): AbstractControl {
    const validators: ValidatorFn[] = [];
    if (field.required) {
      validators.push(Validators.required);
    }

    const base = sourceConfig && sourceConfig[field.name] !== undefined ? sourceConfig[field.name] : undefined;

    let value: string | boolean;
    switch (field.type) {
      case 'secret':
        // Never prefill secrets; empty means "keep the existing key" on edit.
        value = '';
        break;
      case 'bool':
        value = base !== undefined ? !!base : !!field.default;
        break;
      case 'int':
        validators.push(Validators.pattern(INT_PATTERN));
        value = this.initialTextValue(base, field);
        break;
      case 'float':
        validators.push(Validators.pattern(FLOAT_PATTERN));
        value = this.initialTextValue(base, field);
        break;
      default:
        value = this.initialTextValue(base, field);
        break;
    }
    return this.fb.control(value, validators);
  }

  private initialTextValue(base: unknown, field: ProviderConfigField): string {
    if (base !== undefined && base !== null) {
      return String(base);
    }
    if (field.default !== undefined && field.default !== null) {
      return String(field.default);
    }
    return '';
  }

  /* ==================== Provider switching ==================== */

  onProviderChange(provider: string): void {
    if (provider === this.selectedProvider()) {
      return;
    }
    this.selectedProvider.set(provider);
    this.showAdvanced.set(false);

    // Values carried over only when re-selecting the config's own provider;
    // a switch to a different provider starts from the schema defaults.
    const config = this.config();
    const sourceConfig = this.mode() === 'edit' && config && config.config.provider === provider ? config.config : null;
    this.form.setControl('configFields', this.buildConfigFields(this.providerDef(), sourceConfig));
    this.cd.markForCheck();
  }

  toggleAdvanced(): void {
    this.showAdvanced.update((visible) => !visible);
  }

  /* ==================== Display helpers ==================== */

  fieldLabel(field: ProviderConfigField): string {
    return field.label || this.humanize(field.name);
  }

  /**
   * Friendly label for a select option. Known enums get curated labels;
   * unknown schema options are humanized verbatim.
   */
  optionLabel(field: ProviderConfigField, option: string): string {
    if (field.name === 'context_strategy') {
      return CONTEXT_STRATEGIES.find((strategy) => strategy.value === option)?.label ?? this.humanize(option);
    }
    if (field.name === 'copilot_mode') {
      return COPILOT_MODES.find((mode) => mode.value === option)?.label ?? this.humanize(option);
    }
    return this.humanize(option);
  }

  private humanize(value: string): string {
    return value
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  /* ==================== Validation & errors ==================== */

  private duplicateNameValidator(): ValidatorFn {
    return (control: AbstractControl): { duplicateName: true } | null => {
      const name = control.value;
      if (!name || !this.existingNames().includes(name)) {
        return null;
      }
      return { duplicateName: true };
    };
  }

  hasError(field: string): boolean {
    const control = this.form.get(field);
    return control ? control.invalid && (control.dirty || control.touched) : false;
  }

  hasFieldError(field: string): boolean {
    return this.hasError(`configFields.${field}`);
  }

  getErrorMessage(field: string): string {
    const control = this.form.get(field);
    if (!control?.errors) {
      return '';
    }
    const errors = control.errors;
    if (errors.required) {
      return 'This field is required';
    }
    if (errors.minlength) {
      return 'Name must be at least 1 character';
    }
    if (errors.maxlength) {
      return 'Name cannot exceed 100 characters';
    }
    if (errors.pattern) {
      return 'Name can only contain letters, numbers, underscores and hyphens';
    }
    if (errors.duplicateName) {
      return 'Name already exists';
    }
    return 'Invalid format';
  }

  getFieldErrorMessage(field: ProviderConfigField): string {
    const control = this.form.get(`configFields.${field.name}`);
    if (!control?.errors) {
      return '';
    }
    if (control.errors.required) {
      return `${this.fieldLabel(field)} is required`;
    }
    if (control.errors.pattern) {
      return `Enter a valid ${field.type}`;
    }
    return 'Invalid format';
  }

  /* ==================== Submit ==================== */

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.cd.markForCheck();
      return;
    }

    const raw = this.form.getRawValue();
    const config = this.config();
    const originalConfig = this.mode() === 'edit' && config ? config.config : null;
    const providerChanged = this.mode() === 'edit' && originalConfig !== null && raw.provider !== originalConfig.provider;

    const configData: CreateLLMModelConfigRequest = {
      name: raw.name,
      // Keep the stored type on edit; new configs are pinned to the only
      // supported type.
      model_type: this.config()?.model_type ?? AiProfileSchemaFormComponent.SUPPORTED_MODEL_TYPE,
      provider: raw.provider,
      is_default: !!raw.is_default,
    };

    // Legacy passthrough: config keys the schema does not describe survive an
    // edit when the provider stays the same. A provider switch drops them -
    // they belong to the previous integration.
    if (originalConfig && !providerChanged) {
      const schemaNames = new Set(this.capabilityFilteredFields(this.providerDef()).map((field) => field.name));
      for (const [key, value] of Object.entries(originalConfig)) {
        if (key === 'api_key' || schemaNames.has(key)) {
          continue;
        }
        (configData as Record<string, unknown>)[key] = value;
      }
    }

    const def = this.providerDef();
    if (def) {
      const rawFields = (raw.configFields ?? {}) as Record<string, unknown>;
      for (const field of this.capabilityFilteredFields(def)) {
        const converted = this.convertFieldValue(field, rawFields[field.name], originalConfig);
        if (converted !== undefined) {
          (configData as Record<string, unknown>)[field.name] = converted;
        }
      }
    }

    this.dialogRef.close(configData);
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  /**
   * Convert one form value to its payload shape. Returns undefined when the
   * key should be omitted.
   *
   * - secret: empty means "keep the existing key", never sent.
   * - empty optional value: omitted on create; on edit an explicit JSON null
   *   is sent only when the key existed on the original config (clearing
   *   intent), otherwise omitted.
   */
  private convertFieldValue(
    field: ProviderConfigField,
    value: unknown,
    originalConfig: LLMModelConfigData | null
  ): unknown | undefined {
    switch (field.type) {
      case 'secret': {
        const trimmed = typeof value === 'string' ? value.trim() : '';
        return trimmed || undefined;
      }
      case 'int': {
        if (value === '' || value === null || value === undefined) {
          return this.emptyValueOutcome(field, originalConfig);
        }
        const parsed = parseInt(String(value), 10);
        return Number.isNaN(parsed) ? this.emptyValueOutcome(field, originalConfig) : parsed;
      }
      case 'float': {
        if (value === '' || value === null || value === undefined) {
          return this.emptyValueOutcome(field, originalConfig);
        }
        const parsed = parseFloat(String(value));
        return Number.isNaN(parsed) ? this.emptyValueOutcome(field, originalConfig) : parsed;
      }
      case 'bool':
        return !!value;
      default: {
        const trimmed = typeof value === 'string' ? value.trim() : String(value ?? '');
        return trimmed || this.emptyValueOutcome(field, originalConfig);
      }
    }
  }

  private emptyValueOutcome(
    field: ProviderConfigField,
    originalConfig: LLMModelConfigData | null
  ): unknown | undefined {
    const original = originalConfig?.[field.name];
    if (this.mode() === 'edit' && original !== undefined && original !== null && original !== '') {
      return null;
    }
    return undefined;
  }
}
