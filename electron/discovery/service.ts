import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { BRAND } from '../../shared/brand';
import type { PeerAnnounce, PeerInfo } from '../../shared/protocol';
import { osKindFromPlatform } from '../../shared/protocol';
import { listLanIpv4, pickDefaultIface } from '../../shared/net';
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
      console.error('[LanDrop] discovery socket error', err);
      this.emit('error', err);
    });

    socket.on('message', (msg, rinfo) => {
      this.onMessage(msg, rinfo.address);
    });

    // 绑 0.0.0.0 才能收齐各网卡上的组播/广播
    socket.bind(BRAND.multicastPort, '0.0.0.0', () => {
      try {
        socket.setBroadcast(true);
        socket.setMulticastTTL(2);
        socket.setMulticastLoopback(true);
      } catch (err) {
        console.warn('[LanDrop] discovery socket opts', err);
      }

      this.joinMulticastAllIfaces(socket);
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
    this.joinMulticastAllIfaces(this.socket);
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

  private joinMulticastAllIfaces(socket: dgram.Socket | null): void {
    if (!socket) return;
    const ifaces = listLanIpv4();
    const preferred = resolveBindAddress();
    const targets =
      preferred && preferred !== '0.0.0.0'
        ? [preferred, ...ifaces.map((i) => i.address).filter((a) => a !== preferred)]
        : ifaces.map((i) => i.address);

    if (targets.length === 0) {
      try {
        socket.addMembership(BRAND.multicastAddress);
      } catch {
        /* ignore */
      }
      return;
    }

    for (const addr of targets) {
      try {
        socket.addMembership(BRAND.multicastAddress, addr);
      } catch {
        /* already joined / unsupported */
      }
    }
  }

  private primaryLanIp(): string {
    const bound = resolveBindAddress();
    if (bound && bound !== '0.0.0.0') return bound;
    return pickDefaultIface()?.address ?? '127.0.0.1';
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
      ip: this.primaryLanIp(),
    };
  }

  private announce(): void {
    if (!this.socket) return;
    const payload = Buffer.from(JSON.stringify(this.buildAnnounce()), 'utf8');
    const socket = this.socket;
    const ifaces = listLanIpv4();

    const send = (host: string, ifaceHint?: string) => {
      try {
        if (ifaceHint) {
          try {
            socket.setMulticastInterface(ifaceHint);
          } catch {
            /* ignore */
          }
        }
        socket.send(payload, 0, payload.length, BRAND.multicastPort, host);
      } catch (err) {
        console.warn('[LanDrop] announce send failed', host, err);
      }
    };

    // 1) 组播：按网卡分别发出（Win/Mac 跨机更稳）
    if (ifaces.length === 0) {
      send(BRAND.multicastAddress);
    } else {
      for (const iface of ifaces) {
        send(BRAND.multicastAddress, iface.address);
      }
    }

    // 2) 子网广播兜底（很多家用路由对组播不友好）
    const broadcasts = new Set<string>();
    for (const iface of ifaces) {
      if (iface.broadcast) broadcasts.add(iface.broadcast);
    }
    broadcasts.add('255.255.255.255');
    for (const b of broadcasts) {
      send(b);
    }
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

    const ip =
      data.ip && data.ip !== '0.0.0.0' && data.ip !== '127.0.0.1'
        ? data.ip
        : fromIp;
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
