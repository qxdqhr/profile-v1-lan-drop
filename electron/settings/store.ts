import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { BRAND } from '../../shared/brand';
import { pickDefaultIface } from '../../shared/net';

export interface AppSettings {
  deviceId: string;
  displayName: string;
  httpsPort: number;
  /** Empty = auto */
  bindAddress: string;
  downloadDir: string;
  receivePaused: boolean;
}

const FILE = () => path.join(app.getPath('userData'), 'settings.json');

function defaults(): AppSettings {
  const host = pickDefaultIface()?.address;
  return {
    deviceId: randomUUID(),
    displayName: `${BRAND.appName}-${os.hostname().slice(0, 24)}`,
    httpsPort: BRAND.defaultHttpsPort,
    bindAddress: host ?? '',
    downloadDir: path.join(app.getPath('downloads'), BRAND.appName),
    receivePaused: false,
  };
}

let cache: AppSettings | null = null;

export function loadSettings(): AppSettings {
  if (cache) return cache;
  const base = defaults();
  try {
    if (fs.existsSync(FILE())) {
      const raw = JSON.parse(fs.readFileSync(FILE(), 'utf8')) as Partial<AppSettings>;
      cache = { ...base, ...raw, deviceId: raw.deviceId || base.deviceId };
      return cache;
    }
  } catch {
    /* ignore */
  }
  cache = base;
  saveSettings(cache);
  return cache;
}

export function saveSettings(next: AppSettings): void {
  cache = next;
  fs.mkdirSync(path.dirname(FILE()), { recursive: true });
  fs.writeFileSync(FILE(), JSON.stringify(next, null, 2), 'utf8');
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...loadSettings(), ...patch };
  saveSettings(next);
  return next;
}

export function resolveBindAddress(settings: AppSettings = loadSettings()): string {
  if (settings.bindAddress) return settings.bindAddress;
  return pickDefaultIface()?.address ?? '0.0.0.0';
}
