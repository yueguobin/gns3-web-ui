import type { HostInterfaceIPAddress, NetworkInterface } from '../../../../../cartography/models/node';

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

/**
 * Format a link speed (Mbit/s) as human-readable text. 0 or missing -> '—'.
 * 1000 -> "1 Gbit/s", 2500 -> "2.5 Gbit/s", 100 -> "100 Mbit/s".
 */
export function formatSpeed(mbit?: number): string {
  if (!mbit || mbit <= 0) return '—';
  if (mbit >= 1000) {
    const gbit = mbit / 1000;
    return `${gbit.toFixed(gbit % 1 === 0 ? 0 : 1)} Gbit/s`;
  }
  return `${mbit} Mbit/s`;
}

/**
 * Compact secondary detail for a host interface, e.g. "1 Gbit/s · MTU 1500".
 * Only known values are included; returns '' when neither speed nor MTU is set.
 */
export function formatInterfaceMeta(iface?: NetworkInterface): string {
  if (!iface) return '';
  const parts: string[] = [];
  if (iface.speed && iface.speed > 0) parts.push(formatSpeed(iface.speed));
  if (iface.mtu) parts.push(`MTU ${iface.mtu}`);
  return parts.join(' · ');
}

/**
 * Render Linux interface flags as a labeled, comma-separated string, e.g.
 * "Flags: up, broadcast, running, multicast". Returns '' when there are none.
 */
export function formatFlags(flags?: string[]): string {
  return flags && flags.length > 0 ? `Flags: ${flags.join(', ')}` : '';
}
