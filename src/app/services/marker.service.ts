import { Injectable } from '@angular/core';
import { Controller } from '@models/controller';
import {
  AggregateMarkerMap,
  MarkerDefinitionCreateBody,
  MarkerDefinitionMap,
  MarkerMap,
} from '@models/marker';
import { HttpController } from './http-controller.service';

/** Body for creating/updating a marker. `bpf` is required; the rest are optional. */
export interface MarkerWriteBody {
  bpf: string;
  tag?: number | null;
  name?: string;
  color?: string;
  highlight_duration?: number | null;
  enabled?: boolean;
}

/**
 * REST CRUD for traffic-insight markers.
 *
 * Two layers coexist:
 *  - **Per-link private markers** — sub-resource of a link:
 *    `/projects/{pid}/links/{lid}/markers`.
 *  - **Project-level definitions** — `/projects/{pid}/marker-definitions`. The controller
 *    fans each definition out to every capable link as an inherited marker
 *    (`global-{name}`); update syncs all copies, delete clears them, new links inherit.
 *    Inherited markers are read-only per-link (PUT/DELETE → 409) — edit them here.
 *
 * The server validates the BPF expression (via `tcpdump -d`) and returns a 409
 * `{message: "Invalid BPF expression: ..."}` on a bad expression, or a 409 when
 * no running node with uBridge is attached to the link, or a 409 on per-link edit of
 * an inherited marker / reserved `global` name / duplicate name; 422 on validation
 * (name format, `highlight_duration < 1`, missing `bpf`). All are unwrapped by
 * `ControllerErrorHandler` into a `ControllerError` whose `.message` is the server
 * text, so callers surface them with the standard `err.error?.message || err.message`.
 *
 * Marker STATE is also serialized on the link object (`link.markers`), so after
 * any mutation callers should refresh the link via `LinkService.getLink` and
 * update the data sources + `MarkerRegistryService`.
 */
@Injectable()
export class MarkerService {
  constructor(private httpController: HttpController) {}

  /** List all markers on a link. */
  list(controller: Controller, projectId: string, linkId: string) {
    return this.httpController.get<MarkerMap>(
      controller,
      `/projects/${projectId}/links/${linkId}/markers`
    );
  }

  /** Create a marker. `name` may be omitted (server auto-generates `marker-<link_id[0:8]>`). */
  create(controller: Controller, projectId: string, linkId: string, body: MarkerWriteBody) {
    return this.httpController.post<MarkerMap>(
      controller,
      `/projects/${projectId}/links/${linkId}/markers`,
      body
    );
  }

  /** Update a marker's BPF/tag (server implements as delete + re-add). */
  update(
    controller: Controller,
    projectId: string,
    linkId: string,
    name: string,
    body: MarkerWriteBody
  ) {
    return this.httpController.put<MarkerMap>(
      controller,
      `/projects/${projectId}/links/${linkId}/markers/${encodeURIComponent(name)}`,
      body
    );
  }

  /** Delete a marker by name (204 on success). */
  delete(controller: Controller, projectId: string, linkId: string, name: string) {
    return this.httpController.delete(
      controller,
      `/projects/${projectId}/links/${linkId}/markers/${encodeURIComponent(name)}`
    );
  }

  // ---- Project-level definitions (global rules, fanned out to all capable links) ----

  /** List all definitions + the `link_ids` each is currently bound to. */
  listDefinitions(controller: Controller, projectId: string) {
    return this.httpController.get<MarkerDefinitionMap>(
      controller,
      `/projects/${projectId}/marker-definitions`
    );
  }

  /** Create a definition; the controller fans it out to every capable link. */
  createDefinition(
    controller: Controller,
    projectId: string,
    body: MarkerDefinitionCreateBody
  ) {
    return this.httpController.post<MarkerDefinitionMap>(
      controller,
      `/projects/${projectId}/marker-definitions`,
      body
    );
  }

  /** Update a definition; the controller syncs every inherited copy. */
  updateDefinition(
    controller: Controller,
    projectId: string,
    name: string,
    body: MarkerDefinitionCreateBody
  ) {
    return this.httpController.put<MarkerDefinitionMap>(
      controller,
      `/projects/${projectId}/marker-definitions/${encodeURIComponent(name)}`,
      body
    );
  }

  /** Delete a definition; the controller clears every inherited copy. */
  deleteDefinition(controller: Controller, projectId: string, name: string) {
    return this.httpController.delete(
      controller,
      `/projects/${projectId}/marker-definitions/${encodeURIComponent(name)}`
    );
  }

  // ---- Aggregation ----

  /** Flat list of every marker across all links, keyed `"{link_id}/{name}"`. */
  aggregateList(controller: Controller, projectId: string) {
    return this.httpController.get<AggregateMarkerMap>(
      controller,
      `/projects/${projectId}/markers`
    );
  }
}
