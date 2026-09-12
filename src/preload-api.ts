import type { PeerInfo, TransferProgress, TransferSessionState } from '../shared/protocol';

/** Preload API surface for renderer typings. Runtime is electron/preload.cjs. */
export interface SettingsPatch {
  displayName?: string;
  httpsPort?: number;
  bindAddress?: string;
  downloadDir?: string;
  receivePaused?: boolean;
}

export interface LanDropApi {
  platform: string;
  getPathForFile: (file: File) => string;
  getSnapshot: () => Promise<unknown>;
  updateSettings: (patch: SettingsPatch) => Promise<unknown>;
  refreshPeers: () => Promise<PeerInfo[]>;
  getConnectQr: () => Promise<{ url: string; dataUrl: string }>;
  addPeerByInput: (input: string) => Promise<PeerInfo>;
  pickFiles: () => Promise<string[]>;
  pickFolder: () => Promise<string[]>;
  send: (peerDeviceId: string, paths: string[]) => Promise<unknown>;
  cancelTransfer: () => Promise<unknown>;
  openDownloadDir: () => Promise<unknown>;
  pickDownloadDir: () => Promise<unknown>;
  setReceivePaused: (paused: boolean) => Promise<unknown>;
  onPeers: (cb: (peers: PeerInfo[]) => void) => () => void;
  onSession: (cb: (s: TransferSessionState) => void) => () => void;
  onProgress: (cb: (p: TransferProgress) => void) => () => void;
  onSettingsChanged: (cb: () => void) => () => void;
}
