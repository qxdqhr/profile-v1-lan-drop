import { BRAND } from './brand';

export type OsKind = 'darwin' | 'win32' | 'linux' | 'other';

export interface PeerAnnounce {
  v: typeof BRAND.protocolVersion;
  deviceId: string;
  displayName: string;
  port: number;
  fingerprint: string;
  os: OsKind;
  ip?: string;
}

export interface PeerInfo extends PeerAnnounce {
  ip: string;
  lastSeen: number;
  manual?: boolean;
}

export interface FileMeta {
  id: string;
  /** Relative path using `/` separators (folders preserve structure). */
  relativePath: string;
  size: number;
}

export interface PrepareRequest {
  sessionId: string;
  sender: {
    deviceId: string;
    displayName: string;
    fingerprint: string;
  };
  files: FileMeta[];
}

export type PrepareResponse =
  | { ok: true; tokens: Record<string, string> }
  | { ok: false; reason: 'busy' | 'rejected' | 'paused' | 'error'; message?: string };

export interface TransferProgress {
  sessionId: string;
  direction: 'send' | 'receive';
  fileId: string;
  relativePath: string;
  bytesDone: number;
  bytesTotal: number;
  filesDone: number;
  filesTotal: number;
  overallDone: number;
  overallTotal: number;
}

export interface TransferSessionState {
  sessionId: string;
  direction: 'send' | 'receive';
  peerName: string;
  status: 'preparing' | 'waiting' | 'transferring' | 'done' | 'cancelled' | 'error';
  message?: string;
  progress?: TransferProgress;
}

export function osKindFromPlatform(platform: string): OsKind {
  if (platform === 'darwin' || platform === 'win32' || platform === 'linux') {
    return platform;
  }
  return 'other';
}

export function shortFingerprint(fp: string, len = 8): string {
  return fp.replace(/:/g, '').slice(0, len).toUpperCase();
}

export function buildConnectUrl(peer: {
  ip: string;
  port: number;
  fingerprint: string;
  displayName: string;
}): string {
  const q = new URLSearchParams({
    v: String(BRAND.protocolVersion),
    ip: peer.ip,
    port: String(peer.port),
    fingerprint: peer.fingerprint,
    name: peer.displayName,
  });
  return `${BRAND.protocolScheme}://connect?${q.toString()}`;
}

export function parseConnectUrl(input: string): {
  ip: string;
  port: number;
  fingerprint?: string;
  displayName?: string;
} | null {
  const trimmed = input.trim();
  try {
    if (trimmed.startsWith(`${BRAND.protocolScheme}://`)) {
      const u = new URL(trimmed);
      const ip = u.searchParams.get('ip');
      const port = Number(u.searchParams.get('port'));
      if (!ip || !Number.isFinite(port)) return null;
      return {
        ip,
        port,
        fingerprint: u.searchParams.get('fingerprint') ?? undefined,
        displayName: u.searchParams.get('name') ?? undefined,
      };
    }
  } catch {
    /* fall through */
  }

  // host:port or host
  const m = trimmed.match(/^\[?([^\]]+)\]?:(\d+)$/) || trimmed.match(/^([^:\s]+)$/);
  if (!m) return null;
  if (m[2]) {
    return { ip: m[1], port: Number(m[2]) };
  }
  return { ip: m[1], port: BRAND.defaultHttpsPort };
}
