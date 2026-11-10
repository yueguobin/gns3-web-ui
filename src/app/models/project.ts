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
  error: { message: string; code: number } | null;
}

export class ProjectVariable {
  name: string;
  value: string;
}
