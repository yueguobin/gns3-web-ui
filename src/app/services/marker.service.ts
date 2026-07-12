import { Injectable } from '@angular/core';
import { Controller } from '@models/controller';
import { MarkerMap } from '@models/marker';
import { HttpController } from './http-controller.service';

/** Body for creating/updating a marker. `bpf` is required; `tag`/`name`/`color` are optional. */
export interface MarkerWriteBody {
  bpf: string;
  tag?: number | null;
  name?: string;
  color?: string;
}

/**
 * REST CRUD for traffic-insight markers on a link.
 *
 * Markers are a sub-resource of a link: `/projects/{pid}/links/{lid}/markers`.
 * The server validates the BPF expression (via `tcpdump -d`) and returns a 409
 * `{message: "Invalid BPF expression: ..."}` on a bad expression, or a 409 when
 * no running node with uBridge is attached to the link. Both 409s are unwrapped
 * by `ControllerErrorHandler` into a `ControllerError` whose `.message` is the
 * server text, so callers surface them with the standard
 * `err.error?.message || err.message` pattern.
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
}
