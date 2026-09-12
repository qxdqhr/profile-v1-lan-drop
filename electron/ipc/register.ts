import { ipcMain, dialog, shell, type BrowserWindow } from 'electron';
import QRCode from 'qrcode';
import { listIpv4Interfaces, pickDefaultIface } from '../../shared/net';
import {
  buildConnectUrl,
  parseConnectUrl,
  shortFingerprint,
  type PeerInfo,
  type TransferProgress,
  type TransferSessionState,
} from '../../shared/protocol';
import { BRAND } from '../../shared/brand';
import type { DeviceIdentity } from '../cert/identity';
import { DiscoveryService } from '../discovery/service';
import {
  loadSettings,
  resolveBindAddress,
  updateSettings,
  type AppSettings,
} from '../settings/store';
import { ReceiveServer } from '../transfer/receive-server';
import { SendClient } from '../transfer/send-client';

export interface LanDropRuntime {
  identity: DeviceIdentity;
  discovery: DiscoveryService;
  receiver: ReceiveServer;
  sender: SendClient;
  getWindow: () => BrowserWindow | null;
  refreshTrayMenu: () => void;
}

function broadcast(win: BrowserWindow | null, channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

export function registerIpc(rt: LanDropRuntime): void {
  const { discovery, receiver, sender, getWindow, identity } = rt;

  discovery.on('peers', (peers: PeerInfo[]) => {
    broadcast(getWindow(), 'landrop:peers', peers);
  });

  const onSession = (state: TransferSessionState) => {
    broadcast(getWindow(), 'landrop:session', state);
  };
  const onProgress = (p: TransferProgress) => {
    broadcast(getWindow(), 'landrop:progress', p);
  };
  receiver.on('session', onSession);
  receiver.on('progress', onProgress);
  sender.on('session', onSession);
  sender.on('progress', onProgress);

  ipcMain.handle('landrop:getSnapshot', async () => {
    const settings = loadSettings();
    const ifaces = listIpv4Interfaces();
    const bind = resolveBindAddress(settings);
    return {
      brand: BRAND,
      settings,
      identity: {
        fingerprint: identity.fingerprint,
        shortFingerprint: shortFingerprint(identity.fingerprint),
      },
      bindAddress: bind,
      interfaces: ifaces,
      defaultIface: pickDefaultIface(ifaces),
      peers: discovery.listPeers(),
      connectUrl: buildConnectUrl({
        ip: bind === '0.0.0.0' ? ifaces.find((i) => !i.internal)?.address || '127.0.0.1' : bind,
        port: settings.httpsPort,
        fingerprint: identity.fingerprint,
        displayName: settings.displayName,
      }),
      platform: process.platform,
    };
  });

  ipcMain.handle('landrop:updateSettings', async (_e, patch: Partial<AppSettings>) => {
    const prev = loadSettings();
    const next = updateSettings(patch);
    if (prev.bindAddress !== next.bindAddress || prev.httpsPort !== next.httpsPort) {
      discovery.restart();
      await receiver.stop();
      await receiver.start();
    }
    if (prev.displayName !== next.displayName) {
      discovery.refresh();
    }
    rt.refreshTrayMenu();
    return next;
  });

  ipcMain.handle('landrop:refreshPeers', async () => {
    discovery.refresh();
    return discovery.listPeers();
  });

  ipcMain.handle('landrop:getConnectQr', async () => {
    const settings = loadSettings();
    const bind = resolveBindAddress(settings);
    const ifaces = listIpv4Interfaces();
    const ip =
      bind === '0.0.0.0'
        ? ifaces.find((i) => !i.internal)?.address || '127.0.0.1'
        : bind;
    const url = buildConnectUrl({
      ip,
      port: settings.httpsPort,
      fingerprint: identity.fingerprint,
      displayName: settings.displayName,
    });
    const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240 });
    return { url, dataUrl };
  });

  ipcMain.handle('landrop:addPeerByInput', async (_e, input: string) => {
    const parsed = parseConnectUrl(input);
    if (!parsed) throw new Error('无法解析连接信息');
    const info = await sender.probe(parsed.ip, parsed.port);
    if (parsed.fingerprint && parsed.fingerprint !== info.fingerprint) {
      throw new Error('证书指纹与连接信息不一致');
    }
    const peer: PeerInfo = {
      v: BRAND.protocolVersion,
      deviceId: info.deviceId,
      displayName: info.displayName,
      port: info.port || parsed.port,
      fingerprint: info.fingerprint,
      os: 'other',
      ip: parsed.ip,
      lastSeen: Date.now(),
      manual: true,
    };
    discovery.upsertManual(peer);
    return peer;
  });

  ipcMain.handle('landrop:pickFiles', async () => {
    const win = getWindow();
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] })
      : await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('landrop:pickFolder', async () => {
    const win = getWindow();
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle(
    'landrop:send',
    async (_e, payload: { peerDeviceId: string; paths: string[] }) => {
      const peer = discovery.listPeers().find((p) => p.deviceId === payload.peerDeviceId);
      if (!peer) throw new Error('设备不在列表中');
      await sender.sendToPeer(peer, payload.paths);
      return { ok: true };
    },
  );

  ipcMain.handle('landrop:cancelTransfer', async () => {
    sender.cancel();
    receiver.cancelActive();
    return { ok: true };
  });

  ipcMain.handle('landrop:openDownloadDir', async () => {
    const dir = loadSettings().downloadDir;
    await shell.openPath(dir);
    return { ok: true };
  });

  ipcMain.handle('landrop:pickDownloadDir', async () => {
    const win = getWindow();
    const opts = { properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[] };
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    if (result.canceled || !result.filePaths[0]) return loadSettings();
    return updateSettings({ downloadDir: result.filePaths[0] });
  });

  ipcMain.handle('landrop:setReceivePaused', async (_e, paused: boolean) => {
    const next = updateSettings({ receivePaused: paused });
    rt.refreshTrayMenu();
    return next;
  });
}
