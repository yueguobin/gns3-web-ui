import type { HostInterfaceIPAddress } from '../../../../../cartography/models/node';

/**
 * Drop an IPv6 scope zone (e.g. "fe80::1%eth0" -> "fe80::1").
 * Harmless for IPv4 addresses, which never contain '%'.
 */
export function stripScope(address: string): string {
  return (address ?? '').split('%')[0];
}

/** Count the set bits of a 0-255 IPv4 octet string. */
function ipv4OctetBits(octet: string): number {
  const n = parseInt(octet, 10);
  if (Number.isNaN(n)) return 0;
  return (n >>> 0)
    .toString(2)
    .split('')
    .filter((c) => c === '1').length;
}

/** Convert a dotted-decimal IPv4 netmask to a prefix length. */
function ipv4NetmaskToPrefix(netmask: string): number {
  const octets = netmask.split('.');
  if (octets.length !== 4) return 0;
  return octets.reduce((prefix, octet) => prefix + ipv4OctetBits(octet), 0);
}

/** Expand an IPv6 netmask (possibly with "::") into eight hex groups. */
function ipv6Groups(netmask: string): string[] {
  if (!netmask.includes('::')) {
    return netmask.split(':');
  }
  const [left = '', right = ''] = netmask.split('::');
  const leftGroups = left ? left.split(':') : [];
  const rightGroups = right ? right.split(':') : [];
  const missing = 8 - leftGroups.length - rightGroups.length;
  const fill = missing > 0 ? Array<string>(missing).fill('0') : [];
  return [...leftGroups, ...fill, ...rightGroups];
}

/** Convert a hex IPv6 netmask to a prefix length. */
function ipv6NetmaskToPrefix(netmask: string): number {
  return ipv6Groups(netmask).reduce((prefix, group) => {
    const n = parseInt(group || '0', 16);
    if (Number.isNaN(n)) return prefix;
    return (
      prefix +
      n
        .toString(2)
        .split('')
        .filter((c) => c === '1').length
    );
  }, 0);
}

/**
 * Convert a netmask string (IPv4 dotted-decimal or IPv6 hex) into a CIDR
 * prefix length. Returns 0 for empty/invalid input.
 */
export function netmaskToPrefix(netmask: string, family: string): number {
  if (!netmask) return 0;
  if (family === 'ipv6' || netmask.includes(':')) {
    return ipv6NetmaskToPrefix(netmask);
  }
  return ipv4NetmaskToPrefix(netmask);
}

/**
 * Render a single address as compact "address/prefix" text,
 * e.g. "192.168.1.5/24" or "2001:db8::1/64".
 */
export function formatIpAddress(ip: HostInterfaceIPAddress): string {
  return `${stripScope(ip.address)}/${netmaskToPrefix(ip.netmask, ip.family)}`;
}

/**
 * Render an interface's IP addresses as compact "address/prefix" text joined
 * by commas, e.g. "192.168.1.5/24, 2001:db8::1/64". Returns '' when there are
 * none.
 */
export function formatIpAddresses(ips?: HostInterfaceIPAddress[]): string {
  if (!ips || ips.length === 0) return '';
  return ips.map(formatIpAddress).join(', ');
}
