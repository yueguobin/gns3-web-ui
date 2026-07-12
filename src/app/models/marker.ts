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
  /** Capture-side node chosen by the server. */
  capture_node_id?: string;
  capture_adapter?: number;
  capture_port?: number;
}

/**
 * Markers keyed by name, as serialized on the {@link Link} object.
 * `link.markers` non-empty ⇒ show the traffic-insight icon on the link.
 */
export type MarkerMap = { [name: string]: Marker };

/**
 * Wire shape of the `marker.match` project WebSocket event.
 * The `filter` field IS the marker name (per backend contract).
 * `node_id` is the capture-side node; it is received but not highlighted
 * (per the feature's visualization decision — only the link flashes).
 */
export interface MarkerMatchEvent {
  project_id: string;
  node_id: string;
  link_id: string;
  filter: string;
  tag?: number | null;
  ts: number;
  len: number;
}
