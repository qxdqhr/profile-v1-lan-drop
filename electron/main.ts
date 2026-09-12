import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  type MenuItemConstructorOptions,
} from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTrayIcon } from './tray-icon';
import { loadOrCreateIdentity } from './cert/identity';
import { loadSettings, updateSettings } from './settings/store';
import { DiscoveryService } from './discovery/service';
import { ReceiveServer } from './transfer/receive-server';
import { SendClient } from './transfer/send-client';
import { registerIpc } from './ipc/register';
import { BRAND } from '../shared/brand';

/** vite-plugin-electron 产出 ESM，无内置 __dirname */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    backgroundColor: '#0f1419',
    title: BRAND.appName,
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[LanDrop] did-fail-load', { code, desc, url });
  });

  if (isDev) {
    void mainWindow.loadURL(
      process.env.VITE_DEV_SERVER_URL || 'http://localhost:5175',
    );
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function quitApp() {
  isQuitting = true;
  tray?.destroy();
  tray = null;
  app.quit();
}

function buildTrayMenu(): Menu {
  const paused = loadSettings().receivePaused;
  const template: MenuItemConstructorOptions[] = [
    { label: '显示主窗口', click: () => showMainWindow() },
    {
      label: paused ? '恢复接收' : '暂停接收',
      click: () => {
        updateSettings({ receivePaused: !loadSettings().receivePaused });
        refreshTrayMenu();
        mainWindow?.webContents.send('landrop:settingsChanged');
      },
    },
    { type: 'separator' },
    { label: `退出 ${BRAND.appName}`, click: () => quitApp() },
  ];
  return Menu.buildFromTemplate(template);
}

function refreshTrayMenu() {
  tray?.setContextMenu(buildTrayMenu());
}

function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip(BRAND.appName);
  refreshTrayMenu();
  tray.on('double-click', () => showMainWindow());
}

app.whenReady().then(async () => {
  const identity = await loadOrCreateIdentity();
  loadSettings();

  const discovery = new DiscoveryService(identity);
  const receiver = new ReceiveServer(identity, () => mainWindow);
  const sender = new SendClient(identity);

  registerIpc({
    identity,
    discovery,
    receiver,
    sender,
    getWindow: () => mainWindow,
    refreshTrayMenu,
  });

  createTray();
  createWindow();

  discovery.start();
  try {
    await receiver.start();
  } catch (err) {
    console.error('[LanDrop] HTTPS server failed to start', err);
  }

  app.on('activate', () => {
    showMainWindow();
  });

  app.on('before-quit', () => {
    isQuitting = true;
    discovery.stop();
    void receiver.stop();
  });
});

app.on('window-all-closed', () => {
  // tray keeps process alive
});
