import { describe, expect, it, vi } from 'vitest';
import { Link } from '@models/link';
import { LabelToMapLabelConverter } from './label-to-map-label-converter';
import { LinkNodeToMapLinkNodeConverter } from './link-node-to-map-link-node-converter';
import { LinkToMapLinkConverter } from './link-to-map-link-converter';

function createConverter(): LinkToMapLinkConverter {
  const labelConverter = {
    convert: vi.fn((label) => label),
  } as unknown as LabelToMapLabelConverter;
  return new LinkToMapLinkConverter(new LinkNodeToMapLinkNodeConverter(labelConverter));
}

describe('LinkToMapLinkConverter', () => {
  it('maps runtime interface states to endpoint render states', () => {
    const converter = createConverter();
    const link = {
      link_id: 'link-1',
      nodes: [
        { node_id: 'node-1', adapter_number: 0, port_number: 0, label: { text: 'eth0' } },
        { node_id: 'node-2', adapter_number: 1, port_number: 0, label: { text: 'eth1' } },
      ],
      interface_statuses: ['stopped', 'started'],
    } as Link;

    const mapLink = converter.convert(link);

    expect(mapLink.nodes[0].interfaceStatus).toBe('stopped');
    expect(mapLink.nodes[1].interfaceStatus).toBe('started');
  });

  it('leaves endpoint status undefined when no runtime state was reported', () => {
    const converter = createConverter();
    const link = {
      link_id: 'link-1',
      nodes: [{ node_id: 'node-1', adapter_number: 0, port_number: 0, label: { text: 'eth0' } }],
    } as Link;

    expect(converter.convert(link).nodes[0].interfaceStatus).toBeUndefined();
  });
});
