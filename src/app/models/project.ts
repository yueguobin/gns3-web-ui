export class Project {
  auto_close: boolean;
  auto_open: boolean;
  auto_start: boolean;
  created_by: string;
  drawing_grid_size: number;
  filename: string;
  grid_size: number;
  name: string;
  path: string;
  project_id: string;
  scene_height: number;
  scene_width: number;
  status: string;
  readonly: boolean;
  show_interface_labels?: boolean;
  show_layers?: boolean;
  show_grid?: boolean;
  snap_to_grid?: boolean;
  variables: ProjectVariable[];
  zoom?: number;
  supplier?: Supplier;
}

export class Supplier {
  logo: string;
  url: string;
}

/** Per-recipient outcome of a multi-user or group project distribution. */
export class ProjectDistributionResult {
  username: string;
  /** The recipient's copy, or null when distribution to this user failed. */
  project: Project | null;
  /** Failure detail, or null on success. */
  error: { message: string } | null;
}

/**
 * Status of a distribution job (mirrors the server-side enum).
 * `cancelling` is cooperative and can last minutes on large labs: the copy
 * in flight always completes before the job stops.
 */
export type ProjectDistributionStatus = 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed';

/** Terminal job states: polling stops and the summary notification fires. */
export function isTerminalDistributionStatus(status: ProjectDistributionStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export class ProjectDistribution {
  distribution_id: string;
  project_id: string;
  /** Base name of the copies. */
  name: string;
  /** Username of the user who started the distribution. */
  created_by: string;
  status: ProjectDistributionStatus;
  /** Number of recipients. */
  total: number;
  /** Recipients processed so far, successful or not. */
  completed: number;
  results: ProjectDistributionResult[];
  /** Set when the job itself failed, null otherwise. */
  error: { message: string } | null;
}

/** One share of a project: a user or a user group, with the role the share carries. */
export class ProjectShare {
  ace_id: string;
  /** The user, when the share targets a user. */
  username?: string | null;
  /** The group, when the share targets a user group. */
  group_name?: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

export class ProjectVariable {
  name: string;
  value: string;
}
