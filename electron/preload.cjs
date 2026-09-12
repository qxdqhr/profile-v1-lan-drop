const { contextBridge, ipcRenderer, webUtils } = require('electron');

const api = {
  platform: process.platform,
  getPathForFile: (file) => webUtils.getPathForFile(file),
  getSnapshot: () => ipcRenderer.invoke('landrop:getSnapshot'),
  updateSettings: (patch) => ipcRenderer.invoke('landrop:updateSettings', patch),
  refreshPeers: () => ipcRenderer.invoke('landrop:refreshPeers'),
  getConnectQr: () => ipcRenderer.invoke('landrop:getConnectQr'),
  addPeerByInput: (input) => ipcRenderer.invoke('landrop:addPeerByInput', input),
  pickFiles: () => ipcRenderer.invoke('landrop:pickFiles'),
  pickFolder: () => ipcRenderer.invoke('landrop:pickFolder'),
  send: (peerDeviceId, paths) =>
    ipcRenderer.invoke('landrop:send', { peerDeviceId, paths }),
  cancelTransfer: () => ipcRenderer.invoke('landrop:cancelTransfer'),
  openDownloadDir: () => ipcRenderer.invoke('landrop:openDownloadDir'),
  pickDownloadDir: () => ipcRenderer.invoke('landrop:pickDownloadDir'),
  setReceivePaused: (paused) => ipcRenderer.invoke('landrop:setReceivePaused', paused),
  onPeers: (cb) => {
    const listener = (_event, peers) => cb(peers);
    ipcRenderer.on('landrop:peers', listener);
    return () => ipcRenderer.removeListener('landrop:peers', listener);
  },
  onSession: (cb) => {
    const listener = (_event, s) => cb(s);
    ipcRenderer.on('landrop:session', listener);
    return () => ipcRenderer.removeListener('landrop:session', listener);
  },
  onProgress: (cb) => {
    const listener = (_event, p) => cb(p);
    ipcRenderer.on('landrop:progress', listener);
    return () => ipcRenderer.removeListener('landrop:progress', listener);
  },
  onSettingsChanged: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('landrop:settingsChanged', listener);
    return () => ipcRenderer.removeListener('landrop:settingsChanged', listener);
  },
};

contextBridge.exposeInMainWorld('lanDrop', api);
