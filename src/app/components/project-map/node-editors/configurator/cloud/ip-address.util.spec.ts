import { describe, it, expect } from 'vitest';
import type { HostInterfaceIPAddress } from '../../../../../cartography/models/node';
import { formatIpAddresses, netmaskToPrefix, stripScope } from './ip-address.util';

describe('stripScope', () => {
  it('removes an IPv6 scope zone', () => {
    expect(stripScope('fe80::1%eth0')).toBe('fe80::1');
  });

  it('leaves addresses without a scope unchanged', () => {
    expect(stripScope('192.168.1.5')).toBe('192.168.1.5');
    expect(stripScope('2001:db8::1')).toBe('2001:db8::1');
  });

  it('handles empty input', () => {
    expect(stripScope('')).toBe('');
  });
});

describe('netmaskToPrefix', () => {
  it('converts an IPv4 /24 netmask', () => {
    expect(netmaskToPrefix('255.255.255.0', 'ipv4')).toBe(24);
  });

  it('converts other IPv4 netmasks', () => {
    expect(netmaskToPrefix('255.255.0.0', 'ipv4')).toBe(16);
    expect(netmaskToPrefix('255.0.0.0', 'ipv4')).toBe(8);
    expect(netmaskToPrefix('255.255.255.255', 'ipv4')).toBe(32);
    expect(netmaskToPrefix('0.0.0.0', 'ipv4')).toBe(0);
    expect(netmaskToPrefix('255.255.255.252', 'ipv4')).toBe(30);
  });

  it('converts an IPv6 /64 netmask with "::"', () => {
    expect(netmaskToPrefix('ffff:ffff:ffff:ffff::', 'ipv6')).toBe(64);
  });

  it('converts a full IPv6 /128 netmask', () => {
    expect(netmaskToPrefix('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', 'ipv6')).toBe(128);
  });

  it('detects IPv6 from ":" even without family', () => {
    expect(netmaskToPrefix('ffff:ffff:ffff:ffff::', '')).toBe(64);
  });

  it('returns 0 for empty netmask', () => {
    expect(netmaskToPrefix('', 'ipv4')).toBe(0);
    expect(netmaskToPrefix('', 'ipv6')).toBe(0);
  });
});

describe('formatIpAddresses', () => {
  it('returns empty string for undefined/empty input', () => {
    expect(formatIpAddresses(undefined)).toBe('');
    expect(formatIpAddresses([])).toBe('');
  });

  it('formats a single IPv4 address with prefix', () => {
    const ips: HostInterfaceIPAddress[] = [
      { family: 'ipv4', address: '192.168.1.5', netmask: '255.255.255.0' },
    ];
    expect(formatIpAddresses(ips)).toBe('192.168.1.5/24');
  });

  it('formats mixed IPv4 and IPv6 addresses, stripping scope zones', () => {
    const ips: HostInterfaceIPAddress[] = [
      { family: 'ipv4', address: '192.168.1.5', netmask: '255.255.255.0' },
      { family: 'ipv4', address: '10.0.0.5', netmask: '255.255.255.0' },
      { family: 'ipv6', address: 'fe80::1%eth0', netmask: 'ffff:ffff:ffff:ffff::' },
      { family: 'ipv6', address: '2001:db8::1', netmask: 'ffff:ffff:ffff:ffff::' },
    ];
    expect(formatIpAddresses(ips)).toBe('192.168.1.5/24, 10.0.0.5/24, fe80::1/64, 2001:db8::1/64');
  });
});
