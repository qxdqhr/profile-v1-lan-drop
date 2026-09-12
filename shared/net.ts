import os from 'node:os';

export interface NetIface {
  name: string;
  address: string;
  internal: boolean;
  family: 'IPv4';
}

export function listIpv4Interfaces(): NetIface[] {
  const out: NetIface[] = [];
  const map = os.networkInterfaces();
  for (const [name, entries] of Object.entries(map)) {
    if (!entries) continue;
    for (const e of entries) {
      if (e.family === 'IPv4' || (e.family as unknown) === 4) {
        out.push({
          name,
          address: e.address,
          internal: e.internal,
          family: 'IPv4',
        });
      }
    }
  }
  return out;
}

/** Prefer non-internal RFC1918 / link-local-ish LAN addresses. */
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
