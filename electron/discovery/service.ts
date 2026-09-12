import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { BRAND } from '../../shared/brand';
import type { PeerAnnounce, PeerInfo } from '../../shared/protocol';
import { osKindFromPlatform } from '../../shared/protocol';
import { loadSettings, resolveBindAddress } from '../settings/store';
import type { DeviceIdentity } from '../cert/identity';

export class DiscoveryService extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private announceTimer: NodeJS.Timeout | null = null;
  private pruneTimer: NodeJS.Timeout | null = null;
  private peers = new Map<string, PeerInfo>();
  private identity: DeviceIdentity;
  private running = false;

  constructor(identity: DeviceIdentity) {
    super();
    this.identity = identity;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.socket = socket;

    socket.on('error', (err) => {
      this.emit('error', err);
    });

    socket.on('message', (msg, rinfo) => {
      this.onMessage(msg, rinfo.address);
    });

    socket.bind(BRAND.multicastPort, () => {
      try {
        socket.setMulticastTTL(1);
        socket.setBroadcast(true);
        const iface = resolveBindAddress();
        try {
          socket.addMembership(BRAND.multicastAddress, iface === '0.0.0.0' ? undefined : iface);
        } catch {
          socket.addMembership(BRAND.multicastAddress);
        }
        try {
          socket.setMulticastInterface(iface === '0.0.0.0' ? '0.0.0.0' : iface);
        } catch {
          /* ignore on some platforms */
        }
      } catch (err) {
        this.emit('error', err);
      }
      this.announce();
      this.announceTimer = setInterval(() => this.announce(), BRAND.announceIntervalMs);
      this.pruneTimer = setInterval(() => this.prune(), BRAND.announceIntervalMs);
    });
  }

  stop(): void {
    this.running = false;
    if (this.announceTimer) clearInterval(this.announceTimer);
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    this.announceTimer = null;
    this.pruneTimer = null;
    try {
      this.socket?.close();
    } catch {
      /* ignore */
    }
    this.socket = null;
  }

  restart(): void {
    this.stop();
    this.start();
  }

  refresh(): void {
    this.announce();
  }

  listPeers(): PeerInfo[] {
    return [...this.peers.values()].sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
  }

  upsertManual(peer: PeerInfo): void {
    this.peers.set(peer.deviceId, { ...peer, manual: true, lastSeen: Date.now() });
    this.emit('peers', this.listPeers());
  }

  private buildAnnounce(): PeerAnnounce {
    const s = loadSettings();
    return {
      v: BRAND.protocolVersion,
      deviceId: s.deviceId,
      displayName: s.displayName,
      port: s.httpsPort,
      fingerprint: this.identity.fingerprint,
      os: osKindFromPlatform(process.platform),
      ip: resolveBindAddress(),
    };
  }

  private announce(): void {
    if (!this.socket) return;
    const payload = Buffer.from(JSON.stringify(this.buildAnnounce()), 'utf8');
    this.socket.send(
      payload,
      0,
      payload.length,
      BRAND.multicastPort,
      BRAND.multicastAddress,
    );
  }

  private onMessage(msg: Buffer, fromIp: string): void {
    let data: PeerAnnounce;
    try {
      data = JSON.parse(msg.toString('utf8')) as PeerAnnounce;
    } catch {
      return;
    }
    if (data.v !== BRAND.protocolVersion) return;
    const self = loadSettings();
    if (data.deviceId === self.deviceId) return;

    const ip = data.ip && data.ip !== '0.0.0.0' ? data.ip : fromIp;
    const prev = this.peers.get(data.deviceId);
    const peer: PeerInfo = {
      ...data,
      ip,
      lastSeen: Date.now(),
      manual: prev?.manual,
    };
    this.peers.set(data.deviceId, peer);
    this.emit('peers', this.listPeers());
  }

  private prune(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, peer] of this.peers) {
      if (peer.manual) continue;
      if (now - peer.lastSeen > BRAND.peerTtlMs) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.emit('peers', this.listPeers());
  }
}
