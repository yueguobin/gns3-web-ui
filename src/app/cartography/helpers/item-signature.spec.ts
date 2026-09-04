import { describe, expect, it } from 'vitest';
import { linkSignatures } from './item-signature';

describe('linkSignatures', () => {
  it('detects runtime interface status changes as visual changes', () => {
    const link = {
      link_id: 'link-1',
      nodes: [],
      capturing: false,
      suspend: false,
      show_filters_icon: true,
      wireshark: false,
      link_type: 'ethernet',
      interface_statuses: ['started'],
    };
    const before = linkSignatures(link);

    link.interface_statuses = ['stopped'];
    const after = linkSignatures(link);

    expect(after.groups.visual).not.toBe(before.groups.visual);
  });
});
