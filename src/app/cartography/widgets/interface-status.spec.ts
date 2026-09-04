// @vitest-environment jsdom

import { select } from 'd3-selection';
import { describe, expect, it } from 'vitest';

import { MapLink } from '../models/map/map-link';
import { MapNode } from '../models/map/map-node';
import { InterfaceStatusWidget } from './interface-status';

describe('InterfaceStatusWidget', () => {
  it('renders each self-link endpoint using its own runtime interface status', () => {
    const node = { id: 'docker-1', status: 'started' } as MapNode;
    const link = {
      nodes: [
        { nodeId: node.id, label: { text: 'eth0' }, interfaceStatus: 'stopped' },
        { nodeId: node.id, label: { text: 'eth1' }, interfaceStatus: 'started' },
      ],
      source: node,
      target: node,
      suspend: false,
      parallelLinksCount: 1,
    } as MapLink;
    const widget = new InterfaceStatusWidget({
      showInterfaceLabels: true,
      integrateLinkLabelsToLinks: true,
    } as any);
    const svg = select(document.body).append('svg');
    const view = svg.append('g').datum(link) as any;
    const path = view.append('path').node() as SVGPathElement;
    path.getTotalLength = () => 200;
    path.getPointAtLength = (distance: number) => ({ x: distance, y: 0 }) as SVGPoint;

    widget.draw(view);

    expect(view.selectAll('rect.status_stopped').size()).toBe(1);
    expect(view.selectAll('rect.status_started').size()).toBe(1);
    expect(view.select('text.status_stopped_label').text()).toBe('eth0');
    expect(view.select('text.status_started_label').text()).toBe('eth1');
  });

  it('keeps a stopped node red even if its last interface status was up', () => {
    const stoppedNode = { id: 'docker-1', status: 'stopped' } as MapNode;
    const startedNode = { id: 'docker-2', status: 'started' } as MapNode;
    const link = {
      nodes: [
        { nodeId: stoppedNode.id, label: { text: 'eth0' }, interfaceStatus: 'started' },
        { nodeId: startedNode.id, label: { text: 'eth0' }, interfaceStatus: 'started' },
      ],
      source: stoppedNode,
      target: startedNode,
      suspend: false,
      parallelLinksCount: 1,
    } as MapLink;
    const widget = new InterfaceStatusWidget({
      showInterfaceLabels: true,
      integrateLinkLabelsToLinks: true,
    } as any);
    const svg = select(document.body).append('svg');
    const view = svg.append('g').datum(link) as any;
    const path = view.append('path').node() as SVGPathElement;
    path.getTotalLength = () => 200;
    path.getPointAtLength = (distance: number) => ({ x: distance, y: 0 }) as SVGPoint;

    widget.draw(view);

    expect(view.selectAll('rect.status_stopped').size()).toBe(1);
    expect(view.selectAll('rect.status_started').size()).toBe(1);
  });
});
