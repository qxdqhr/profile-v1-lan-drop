import os from 'node:os';

export interface NetIface {
  name: string;
  address: string;
  netmask: string;
  broadcast: string | null;
  internal: boolean;
  family: 'IPv4';
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}

function intToIpv4(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

export function broadcastFrom(address: string, netmask: string): string | null {
  try {
    const a = ipv4ToInt(address);
    const m = ipv4ToInt(netmask);
    if (!m) return null;
    return intToIpv4((a & m) | (~m >>> 0));
  } catch {
    return null;
  }
}

export function listIpv4Interfaces(): NetIface[] {
  const out: NetIface[] = [];
  const map = os.networkInterfaces();
  for (const [name, entries] of Object.entries(map)) {
    if (!entries) continue;
    for (const e of entries) {
      if (e.family === 'IPv4' || (e.family as unknown) === 4) {
        const netmask = e.netmask || '255.255.255.0';
        out.push({
          name,
          address: e.address,
          netmask,
          broadcast: e.internal ? null : broadcastFrom(e.address, netmask),
          internal: e.internal,
          family: 'IPv4',
        });
      }
    }
  }
  return out;
}

/** Prefer non-internal RFC1918 LAN addresses. */
export function pickDefaultIface(ifaces: NetIface[] = listIpv4Interfaces()): NetIface | null {
  const external = ifaces.filter((i) => !i.internal);
  const score = (addr: string): number => {
    if (addr.startsWith('192.168.')) return 100;
    if (addr.startsWith('10.')) return 90;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(addr)) return 80;
    if (addr.startsWith('169.254.')) return 10;
    return 50;
  };
  external.sort((a, b) => score(b.address) - score(a.address));
  return external[0] ?? null;
}

export function listLanIpv4(): NetIface[] {
  return listIpv4Interfaces().filter(
    (i) => !i.internal && !i.address.startsWith('169.254.'),
  );
}
