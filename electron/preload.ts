import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { PeerInfo, TransferProgress, TransferSessionState } from '../shared/protocol';

export interface SettingsPatch {
  displayName?: string;
  httpsPort?: number;
  bindAddress?: string;
  downloadDir?: string;
  receivePaused?: boolean;
}

const api = {
  platform: process.platform,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  getSnapshot: () => ipcRenderer.invoke('landrop:getSnapshot'),
  updateSettings: (patch: SettingsPatch) =>
    ipcRenderer.invoke('landrop:updateSettings', patch),
  refreshPeers: () => ipcRenderer.invoke('landrop:refreshPeers') as Promise<PeerInfo[]>,
  getConnectQr: () =>
    ipcRenderer.invoke('landrop:getConnectQr') as Promise<{ url: string; dataUrl: string }>,
  addPeerByInput: (input: string) => ipcRenderer.invoke('landrop:addPeerByInput', input),
  pickFiles: () => ipcRenderer.invoke('landrop:pickFiles') as Promise<string[]>,
  pickFolder: () => ipcRenderer.invoke('landrop:pickFolder') as Promise<string[]>,
  send: (peerDeviceId: string, paths: string[]) =>
    ipcRenderer.invoke('landrop:send', { peerDeviceId, paths }),
  cancelTransfer: () => ipcRenderer.invoke('landrop:cancelTransfer'),
  openDownloadDir: () => ipcRenderer.invoke('landrop:openDownloadDir'),
  pickDownloadDir: () => ipcRenderer.invoke('landrop:pickDownloadDir'),
  setReceivePaused: (paused: boolean) =>
    ipcRenderer.invoke('landrop:setReceivePaused', paused),
  onPeers: (cb: (peers: PeerInfo[]) => void) => {
    const listener = (_: Electron.IpcRendererEvent, peers: PeerInfo[]) => cb(peers);
    ipcRenderer.on('landrop:peers', listener);
    return () => ipcRenderer.removeListener('landrop:peers', listener);
  },
  onSession: (cb: (s: TransferSessionState) => void) => {
    const listener = (_: Electron.IpcRendererEvent, s: TransferSessionState) => cb(s);
    ipcRenderer.on('landrop:session', listener);
    return () => ipcRenderer.removeListener('landrop:session', listener);
  },
  onProgress: (cb: (p: TransferProgress) => void) => {
    const listener = (_: Electron.IpcRendererEvent, p: TransferProgress) => cb(p);
    ipcRenderer.on('landrop:progress', listener);
    return () => ipcRenderer.removeListener('landrop:progress', listener);
  },
  onSettingsChanged: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('landrop:settingsChanged', listener);
    return () => ipcRenderer.removeListener('landrop:settingsChanged', listener);
  },
};

contextBridge.exposeInMainWorld('lanDrop', api);

export type LanDropApi = typeof api;
