import { EventEmitter, Injectable } from '@angular/core';
import { DrawingsDataSource } from '../cartography/datasources/drawings-datasource';
import { LinksDataSource } from '../cartography/datasources/links-datasource';
import { NodesDataSource } from '../cartography/datasources/nodes-datasource';
import { Drawing } from '../cartography/models/drawing';
import { Node } from '../cartography/models/node';
import { Link } from '@models/link';
import { MarkerMatchEvent } from '@models/marker';
import { MarkerFlashService } from '@services/marker-flash.service';
import { MarkerRegistryService } from '@services/marker-registry.service';

export class WebServiceMessage {
  action: string;
  event: Node | Link | Drawing | any;
}

export interface InterfaceStatusEvent {
  project_id: string;
  node_id: string;
  adapter_number: number;
  port_number: number;
  status: 'started' | 'stopped' | 'up' | 'down';
}

type InterfaceStatus = 'started' | 'stopped';

@Injectable()
export class ProjectWebServiceHandler {
  public nodeNotificationEmitter = new EventEmitter<WebServiceMessage>();
  public linkNotificationEmitter = new EventEmitter<WebServiceMessage>();
  public drawingNotificationEmitter = new EventEmitter<WebServiceMessage>();

  public infoNotificationEmitter = new EventEmitter<any>();
  public warningNotificationEmitter = new EventEmitter<any>();
  public errorNotificationEmitter = new EventEmitter<any>();

  private interfaceStatuses = new Map<string, InterfaceStatus>();

  constructor(
    private nodesDataSource: NodesDataSource,
    private linksDataSource: LinksDataSource,
    private drawingsDataSource: DrawingsDataSource,
    private markerRegistryService: MarkerRegistryService,
    private markerFlashService: MarkerFlashService
  ) {}

  public handleMessage(message: WebServiceMessage) {
    if (message.action === 'node.interface_status') {
      const event = message.event as InterfaceStatusEvent;
      const status = this.normalizeInterfaceStatus(event.status);
      if (!status) return;
      this.interfaceStatuses.set(this.interfaceStatusKey(event), status);
      for (const link of this.linksDataSource.getItems()) {
        const endpointIndex = (link.nodes || []).findIndex(
          (node) =>
            node.node_id === event.node_id &&
            node.adapter_number === event.adapter_number &&
            node.port_number === event.port_number
        );
        if (endpointIndex >= 0 && link.interface_statuses?.[endpointIndex] !== status) {
          this.setInterfaceStatus(link, endpointIndex, status);
          this.linksDataSource.update(link);
        }
      }
    }
    if (message.action === 'node.updated') {
      this.nodesDataSource.update(message.event as Node);
      this.nodeNotificationEmitter.emit(message);
    }
    if (message.action === 'node.created') {
      this.nodesDataSource.add(message.event as Node);
      this.nodeNotificationEmitter.emit(message);
    }
    if (message.action === 'node.deleted') {
      const node = message.event as Node;
      this.nodesDataSource.remove(node);
      for (const key of this.interfaceStatuses.keys()) {
        if (key.startsWith(`${node.project_id}:${node.node_id}:`)) this.interfaceStatuses.delete(key);
      }
      this.nodeNotificationEmitter.emit(message);
    }
    if (message.action === 'link.created') {
      const link = message.event as Link;
      this.applyInterfaceStatusesToLink(link);
      this.linksDataSource.add(link);
      this.markerRegistryService.reconcileLink(link);
      this.linkNotificationEmitter.emit(message);
    }
    if (message.action === 'link.updated') {
      const link = message.event as Link;
      this.applyInterfaceStatusesToLink(link);
      this.linksDataSource.update(link);
      this.markerRegistryService.reconcileLink(link);
      this.linkNotificationEmitter.emit(message);
    }
    if (message.action === 'link.deleted') {
      const link = message.event as Link;
      this.linksDataSource.remove(link);
      this.markerRegistryService.removeLink(link.link_id);
      // The link (and its path element) is gone — its geometry cache entry
      // would never be used again and never evicted (app-singleton service).
      this.markerFlashService.evictLink(link.link_id);
      this.linkNotificationEmitter.emit(message);
    }
    if (message.action === 'marker.match') {
      const event = message.event as MarkerMatchEvent;
      // Resolve the marker's color + highlight_duration from link state (event carries
      // neither). `filter` is the marker name; null color ⇒ default theme color;
      // null duration ⇒ UI default (see MarkerFlashService). `dir` + `node_id` orient
      // the direction arrow; null/absent `dir` (old uBridge) ⇒ flash without arrow.
      const link = this.linksDataSource.get(event.link_id);
      const marker = link?.markers?.[event.filter];
      this.markerFlashService.flash(
        event.link_id,
        marker?.color ?? null,
        marker?.highlight_duration ?? null,
        event.dir ?? null,
        event.node_id
      );
    }
    if (message.action === 'drawing.created') {
      this.drawingsDataSource.add(message.event as Drawing);
      this.drawingNotificationEmitter.emit(message);
    }
    if (message.action === 'drawing.updated') {
      this.drawingsDataSource.update(message.event as Drawing);
      this.drawingNotificationEmitter.emit(message);
    }
    if (message.action === 'drawing.deleted') {
      this.drawingsDataSource.remove(message.event as Drawing);
      this.drawingNotificationEmitter.emit(message);
    }
    if (message.action === 'log.error') {
      this.errorNotificationEmitter.emit(message.event.message);
    }
    if (message.action === 'log.warning') {
      this.warningNotificationEmitter.emit(message.event.message);
    }
    if (message.action === 'log.info') {
      this.infoNotificationEmitter.emit(message.event.message);
    }
  }

  public applyInterfaceStatuses(links: Link[]): void {
    links.forEach((link) => this.applyInterfaceStatusesToLink(link));
  }

  public clearInterfaceStatuses(projectId: string): void {
    for (const key of this.interfaceStatuses.keys()) {
      if (key.startsWith(`${projectId}:`)) this.interfaceStatuses.delete(key);
    }
  }

  private interfaceStatusKey(event: {
    project_id: string;
    node_id: string;
    adapter_number: number;
    port_number: number;
  }): string {
    return `${event.project_id}:${event.node_id}:${event.adapter_number}:${event.port_number}`;
  }

  private normalizeInterfaceStatus(status: InterfaceStatusEvent['status']): InterfaceStatus | undefined {
    if (status === 'started' || status === 'up') return 'started';
    if (status === 'stopped' || status === 'down') return 'stopped';
    return undefined;
  }

  private applyInterfaceStatusesToLink(link: Link): void {
    for (const [index, endpoint] of (link.nodes || []).entries()) {
      const status = this.interfaceStatuses.get(
        this.interfaceStatusKey({
          project_id: link.project_id,
          node_id: endpoint.node_id,
          adapter_number: endpoint.adapter_number,
          port_number: endpoint.port_number,
        })
      );
      if (status && link.interface_statuses?.[index] !== status) this.setInterfaceStatus(link, index, status);
    }
  }

  private setInterfaceStatus(link: Link, endpointIndex: number, status: InterfaceStatus): void {
    const statuses = [...(link.interface_statuses || [])];
    statuses[endpointIndex] = status;
    link.interface_statuses = statuses;
  }
}
