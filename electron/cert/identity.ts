import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { app } from 'electron';
import { generate } from 'selfsigned';
import { BRAND } from '../../shared/brand';

export interface DeviceIdentity {
  certPem: string;
  keyPem: string;
  fingerprint: string;
}

const ID_FILE = () => path.join(app.getPath('userData'), 'identity.json');

function fingerprintFromCertPem(certPem: string): string {
  const b64 = certPem
    .replace(/-----BEGIN CERTIFICATE-----/, '')
    .replace(/-----END CERTIFICATE-----/, '')
    .replace(/\s+/g, '');
  const der = Buffer.from(b64, 'base64');
  return createHash('sha256').update(der).digest('hex');
}

export async function loadOrCreateIdentity(): Promise<DeviceIdentity> {
  try {
    if (fs.existsSync(ID_FILE())) {
      const raw = JSON.parse(fs.readFileSync(ID_FILE(), 'utf8')) as DeviceIdentity;
      if (raw.certPem && raw.keyPem && raw.fingerprint) return raw;
    }
  } catch {
    /* regenerate */
  }

  const attrs = [{ name: 'commonName', value: BRAND.appName }];
  const pems = await generate(attrs, {
    keySize: 2048,
    algorithm: 'sha256',
  });

  const identity: DeviceIdentity = {
    certPem: pems.cert,
    keyPem: pems.private,
    fingerprint: fingerprintFromCertPem(pems.cert),
  };

  fs.mkdirSync(path.dirname(ID_FILE()), { recursive: true });
  fs.writeFileSync(ID_FILE(), JSON.stringify(identity, null, 2), 'utf8');
  return identity;
}
