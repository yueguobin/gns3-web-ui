/**
 * A traffic-insight marker attached to a link.
 *
 * Unlike {@link Filter.bpf} (which is `string[]`), a marker's `bpf` is a single
 * expression evaluated against live traffic by uBridge. When it matches, the
 * backend emits a `marker.match` WebSocket event (see {@link MarkerMatchEvent}).
 */
export interface Marker {
  bpf: string;
  tag?: number | null;
  /** User-chosen highlight color (hex, persisted by backend). Defaults to theme primary. */
  color?: string;
  enabled?: boolean;
  /** UI highlight duration (ms) after a match; `null` ⇒ UI default. Never sent to uBridge. */
  highlight_duration?: number | null;
  /** Source definition name — present on inherited markers only (`null` for private). */
  inherited_from?: string | null;
  /** Capture-side node chosen by the server. */
  capture_node_id?: string;
  capture_adapter?: number;
  capture_port?: number;
}

/**
 * Markers keyed by name, as serialized on the {@link Link} object.
 * `link.markers` non-empty ⇒ the link has markers and flashes on a `marker.match`.
 * Inherited markers are keyed `global-{definitionName}` with `inherited_from` set.
 */
export type MarkerMap = { [name: string]: Marker };

/**
 * A project-level marker definition — a global rule the controller fans out to every
 * capable link as an inherited marker (`global-{name}`). Editing a definition syncs all
 * copies; deleting clears them; new links inherit automatically. Managed via
 * `/projects/{pid}/marker-definitions`.
 */
export interface MarkerDefinition {
  bpf: string;
  tag?: number | null;
  color?: string | null;
  highlight_duration?: number | null;
  /** Links currently carrying an inherited copy (GET only). */
  link_ids?: string[];
}

/** Definitions keyed by name. */
export type MarkerDefinitionMap = { [name: string]: MarkerDefinition };

/** Body for creating/updating a definition (shared by POST and PUT). */
export interface MarkerDefinitionCreateBody {
  name?: string;
  bpf: string;
  tag?: number | null;
  color?: string;
  highlight_duration?: number | null;
}

/**
 * A marker in the flat aggregate view (`GET /projects/{pid}/markers`), keyed by
 * `"{link_id}/{name}"`. Extends {@link Marker} with the owning link/node ids.
 */
export interface AggregateMarkerEntry extends Marker {
  link_id: string;
  node_id?: string;
}

/** Aggregate markers keyed by `"{link_id}/{name}"`. */
export type AggregateMarkerMap = { [key: string]: AggregateMarkerEntry };

/**
 * Wire shape of the `marker.match` project WebSocket event.
 * The `filter` field IS the marker name (per backend contract).
 * `node_id` is the capture-side node (one of the link's two endpoints);
 * it is not highlighted itself — it orients the direction arrow.
 */
export interface MarkerMatchEvent {
  project_id: string;
  node_id: string;
  link_id: string;
  filter: string;
  tag?: number | null;
  ts: number;
  len: number;
  /**
   * Traffic direction relative to the capture node (`node_id`):
   *  - `"tx"` → capture node is sending → flow is capture → peer
   *  - `"rx"` → capture node is receiving → flow is peer → capture
   *
   * Absent or `null` for old uBridge builds that don't report direction;
   * in that case the link flashes without an arrow (legacy behaviour).
   */
  dir?: 'tx' | 'rx' | null;
}
