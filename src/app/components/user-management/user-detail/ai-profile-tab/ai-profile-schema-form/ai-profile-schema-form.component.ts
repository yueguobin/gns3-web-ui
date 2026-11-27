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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { Controller } from '@models/controller';
import { AiProfilesService } from '@services/ai-profiles.service';
import {
  CreateLLMModelConfigRequest,
  LLMModelConfigData,
  LLMModelConfigResponse,
  LLMModelConfigWithSource,
  ProviderCapabilities,
  ProviderConfigField,
  ProviderModel,
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

/**
 * Client-side presentation order for known connection fields: the key and
 * base URL are entered (or pre-filled from the schema default) before the
 * model field, so the fetch-model-list flow reads top-down:
 * provider -> api key -> base url -> fetch -> model.
 * Everything not listed here keeps the schema's declared order.
 */
const FIELD_PRESENTATION_PRIORITY = ['api_key', 'base_url', 'model'];

const INT_PATTERN = new RegExp('^-?\\d+$');
const FLOAT_PATTERN = new RegExp('^-?\\d+(\\.\\d+)?$');

/**
 * Sentinel select value for leaving the fetched model list and going back
 * to typing the model name by hand (the schema keeps the model field free
 * text on purpose; manual input is the fallback).
 */
const MODEL_MANUAL_SENTINEL = '__manual__';

type ModelFetchState = 'idle' | 'loading' | 'done' | 'error';

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
    MatProgressSpinnerModule,
  ],
})
export class AiProfileSchemaFormComponent implements OnInit {
  readonly mode = input.required<'create' | 'edit'>();
  readonly config = input<LLMModelConfigResponse | LLMModelConfigWithSource | null>(null);
  readonly existingNames = input<string[]>([]);
  readonly providers = input.required<ProviderSchemaEntry[]>();
  readonly controller = input<Controller | null>(null);

  form!: FormGroup;

  readonly selectedProvider = signal<string>('');
  readonly showAdvanced = signal(false);

  // Live model catalog fetch. Request-scoped per the contract: the list is
  // tied to the typed API key, never cached, and dropped on provider switch.
  readonly modelFetchState = signal<ModelFetchState>('idle');
  readonly fetchedModels = signal<ProviderModel[]>([]);
  readonly modelFetchError = signal('');
  readonly manualModelMode = signal(false);

  // Exposed for the template: select option that leaves the fetched list
  // and returns to typing the model name by hand.
  readonly modelManualSentinel = MODEL_MANUAL_SENTINEL;

  // Only the text model type is supported today (server-side constraint);
  // the config form has no model type selector.
  private static readonly SUPPORTED_MODEL_TYPE = 'text';

  private readonly fb = inject(FormBuilder);
  private readonly aiProfilesService = inject(AiProfilesService);
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

  readonly basicFields = computed(() =>
    this.orderedForPresentation(this.capabilityFilteredFields(this.providerDef())).filter((field) => !field.advanced)
  );
  readonly advancedFields = computed(() =>
    this.orderedForPresentation(this.capabilityFilteredFields(this.providerDef())).filter((field) => !!field.advanced)
  );
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

  /**
   * Presentation order: hoist the connection fields (api key, base URL)
   * ahead of the model field per FIELD_PRESENTATION_PRIORITY; unlisted
   * fields keep the schema's declared order. A pure rendering concern -
   * payload building iterates the unfiltered order, which is equivalent.
   */
  private orderedForPresentation(fields: ProviderConfigField[]): ProviderConfigField[] {
    const prioritized = FIELD_PRESENTATION_PRIORITY.map((name) => fields.find((field) => field.name === name)).filter(
      (field): field is ProviderConfigField => !!field
    );
    if (!prioritized.length) {
      return fields;
    }
    const prioritizedNames = new Set(prioritized.map((field) => field.name));
    const rest = fields.filter((field) => !prioritizedNames.has(field.name));
    return [...prioritized, ...rest];
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
    this.resetModelFetch();

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

  /* ==================== Live model catalog fetch ==================== */

  /** Contract-anchored special case: the schema's "model" field supports a live catalog fetch. */
  isModelField(field: ProviderConfigField): boolean {
    return field.name === 'model';
  }

  /** Dropdown replaces the free-text input once a catalog is fetched (unless the user opted out). */
  modelDropdownActive(): boolean {
    return this.fetchedModels().length > 0 && !this.manualModelMode();
  }

  /** Current model value shown as an extra option when it is not part of the fetched catalog (edit mode). */
  missingCurrentModelOption(): string | null {
    if (!this.modelDropdownActive()) {
      return null;
    }
    const current = String(this.form.get('configFields.model')?.value ?? '').trim();
    if (!current || this.fetchedModels().some((model) => model.id === current)) {
      return null;
    }
    return current;
  }

  fetchModels(): void {
    const def = this.providerDef();
    const controller = this.controller();
    if (!def || !controller || this.modelFetchState() === 'loading') {
      return;
    }

    const apiKey = String(this.form.get('configFields.api_key')?.value ?? '').trim();
    if (!apiKey) {
      this.modelFetchState.set('error');
      this.modelFetchError.set('Enter your API key first, then fetch the model list.');
      this.cd.markForCheck();
      return;
    }

    const baseUrl = String(this.form.get('configFields.base_url')?.value ?? '').trim();

    this.modelFetchState.set('loading');
    this.modelFetchError.set('');
    this.cd.markForCheck();

    this.aiProfilesService
      .getProviderModels(controller, {
        provider: def.provider,
        api_key: apiKey,
        ...(baseUrl ? { base_url: baseUrl } : {}),
      })
      .subscribe({
        next: (response) => {
          const models = response?.models ?? [];
          if (!models.length) {
            this.modelFetchState.set('error');
            this.modelFetchError.set('The provider returned no models. Enter the model name manually.');
          } else {
            this.fetchedModels.set(models);
            this.manualModelMode.set(false);
            this.modelFetchState.set('done');
          }
          this.cd.markForCheck();
        },
        error: (error) => {
          // HttpController rewrites failures to ControllerError: the server's
          // message lives on error.message (there is no error.error).
          this.modelFetchState.set('error');
          this.modelFetchError.set(
            error?.message || 'Could not fetch the model list. Enter the model name manually.'
          );
          this.cd.markForCheck();
        },
      });
  }

  onModelSelect(value: string): void {
    if (value === MODEL_MANUAL_SENTINEL) {
      this.manualModelMode.set(true);
      this.form.get('configFields.model')?.setValue('');
      this.cd.markForCheck();
      return;
    }
    // Auto-fill context_limit (K tokens) from the reported context window.
    const entry = this.fetchedModels().find((model) => model.id === value);
    const contextLimit = this.form.get('configFields.context_limit');
    if (entry?.max_input_tokens && contextLimit) {
      contextLimit.setValue(String(Math.floor(entry.max_input_tokens / 1000)));
    }
  }

  private resetModelFetch(): void {
    this.fetchedModels.set([]);
    this.modelFetchState.set('idle');
    this.modelFetchError.set('');
    this.manualModelMode.set(false);
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
    // provider is not a form control (it drives form rebuilds via a signal),
    // so it must be read from the signal - getRawValue() does not contain it.
    const selectedProvider = this.selectedProvider();
    const providerChanged = this.mode() === 'edit' && originalConfig !== null && selectedProvider !== originalConfig.provider;

    const configData: CreateLLMModelConfigRequest = {
      name: raw.name,
      // Keep the stored type on edit; new configs are pinned to the only
      // supported type.
      model_type: this.config()?.model_type ?? AiProfileSchemaFormComponent.SUPPORTED_MODEL_TYPE,
      provider: selectedProvider,
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
