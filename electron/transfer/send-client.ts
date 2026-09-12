import https from 'node:https';
import fs from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { BRAND } from '../../shared/brand';
import type {
  PeerInfo,
  PrepareRequest,
  PrepareResponse,
  TransferProgress,
  TransferSessionState,
} from '../../shared/protocol';
import { loadSettings } from '../settings/store';
import type { DeviceIdentity } from '../cert/identity';
import { collectPaths, type LocalFileEntry } from './paths';

export class SendClient extends EventEmitter {
  private identity: DeviceIdentity;
  private abort: AbortController | null = null;
  private activeSessionId: string | null = null;

  constructor(identity: DeviceIdentity) {
    super();
    this.identity = identity;
  }

  cancel(): void {
    this.abort?.abort();
    this.abort = null;
  }

  async probe(
    ip: string,
    port: number,
  ): Promise<{
    deviceId: string;
    displayName: string;
    fingerprint: string;
    port: number;
    receivePaused?: boolean;
  }> {
    const data = await this.requestJson<{
      deviceId: string;
      displayName: string;
      fingerprint: string;
      port: number;
      receivePaused?: boolean;
    }>('GET', ip, port, `${BRAND.apiPrefix}/info`);
    return data;
  }

  async sendToPeer(peer: PeerInfo, paths: string[]): Promise<void> {
    const files = collectPaths(paths);
    if (files.length === 0) {
      throw new Error('没有可发送的文件');
    }

    const sessionId = randomUUID();
    this.activeSessionId = sessionId;
    this.abort = new AbortController();
    const settings = loadSettings();

    this.emitState({
      sessionId,
      direction: 'send',
      peerName: peer.displayName,
      status: 'preparing',
    });

    const prepareBody: PrepareRequest = {
      sessionId,
      sender: {
        deviceId: settings.deviceId,
        displayName: settings.displayName,
        fingerprint: this.identity.fingerprint,
      },
      files: files.map((f) => ({
        id: f.id,
        relativePath: f.relativePath,
        size: f.size,
      })),
    };

    this.emitState({
      sessionId,
      direction: 'send',
      peerName: peer.displayName,
      status: 'waiting',
    });

    let prepareResp: PrepareResponse;
    try {
      prepareResp = await this.requestJson<PrepareResponse>(
        'POST',
        peer.ip,
        peer.port,
        `${BRAND.apiPrefix}/prepare`,
        prepareBody,
        peer.fingerprint,
      );
    } catch (err) {
      this.emitState({
        sessionId,
        direction: 'send',
        peerName: peer.displayName,
        status: 'error',
        message: String(err),
      });
      throw err;
    }

    if (!prepareResp.ok) {
      this.emitState({
        sessionId,
        direction: 'send',
        peerName: peer.displayName,
        status: 'cancelled',
        message: prepareResp.reason,
      });
      throw new Error(
        prepareResp.reason === 'busy'
          ? '对方忙'
          : prepareResp.reason === 'paused'
            ? '对方已暂停接收'
            : prepareResp.reason === 'rejected'
              ? '对方拒绝接收'
              : prepareResp.message || '准备失败',
      );
    }

    const overallTotal = files.reduce((a, f) => a + f.size, 0);
    let overallDone = 0;

    this.emitState({
      sessionId,
      direction: 'send',
      peerName: peer.displayName,
      status: 'transferring',
    });

    try {
      for (let i = 0; i < files.length; i++) {
        if (this.abort?.signal.aborted) throw new Error('cancelled');
        const file = files[i];
        const token = prepareResp.tokens[file.id];
        if (!token) throw new Error('missing token');

        await this.uploadFile(
          peer,
          file,
          token,
          sessionId,
          i,
          files.length,
          overallDone,
          overallTotal,
          (n) => {
            overallDone += n;
          },
        );
      }

      this.emitState({
        sessionId,
        direction: 'send',
        peerName: peer.displayName,
        status: 'done',
      });
    } catch (err) {
      if (this.abort?.signal.aborted || String(err).includes('cancelled')) {
        try {
          await this.requestJson('POST', peer.ip, peer.port, `${BRAND.apiPrefix}/cancel`, {
            sessionId,
          });
        } catch {
          /* ignore */
        }
        this.emitState({
          sessionId,
          direction: 'send',
          peerName: peer.displayName,
          status: 'cancelled',
        });
      } else {
        this.emitState({
          sessionId,
          direction: 'send',
          peerName: peer.displayName,
          status: 'error',
          message: String(err),
        });
      }
      throw err;
    } finally {
      this.abort = null;
      this.activeSessionId = null;
    }
  }

  private emitState(state: TransferSessionState): void {
    this.emit('session', state);
  }

  private emitProgress(p: TransferProgress): void {
    this.emit('progress', p);
  }

  private uploadFile(
    peer: PeerInfo,
    file: LocalFileEntry,
    token: string,
    sessionId: string,
    fileIndex: number,
    filesTotal: number,
    overallDoneStart: number,
    overallTotal: number,
    onChunk: (n: number) => void,
  ): Promise<void> {
    const pathUrl = `${BRAND.apiPrefix}/upload?fileId=${encodeURIComponent(file.id)}&token=${encodeURIComponent(token)}`;

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          host: peer.ip,
          port: peer.port,
          path: pathUrl,
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': file.size,
          },
          rejectUnauthorized: false,
          timeout: 0,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve();
            } else {
              reject(
                new Error(
                  `upload failed: ${res.statusCode} ${Buffer.concat(chunks).toString('utf8')}`,
                ),
              );
            }
          });
        },
      );

      req.on('error', reject);

      if (this.abort) {
        this.abort.signal.addEventListener('abort', () => {
          req.destroy(new Error('cancelled'));
        });
      }

      const stream = fs.createReadStream(file.absolutePath);
      let fileDone = 0;
      stream.on('data', (chunk: string | Buffer) => {
        const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        fileDone += buf.length;
        onChunk(buf.length);
        this.emitProgress({
          sessionId,
          direction: 'send',
          fileId: file.id,
          relativePath: file.relativePath,
          bytesDone: fileDone,
          bytesTotal: file.size,
          filesDone: fileIndex,
          filesTotal,
          overallDone: overallDoneStart + fileDone,
          overallTotal,
        });
      });
      stream.on('error', (err) => {
        req.destroy(err);
        reject(err);
      });
      stream.pipe(req);
    });
  }

  private requestJson<T>(
    method: string,
    ip: string,
    port: number,
    urlPath: string,
    body?: unknown,
    expectFingerprint?: string,
  ): Promise<T> {
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body), 'utf8');
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          host: ip,
          port,
          path: urlPath,
          method,
          headers: payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': payload.length,
              }
            : undefined,
          rejectUnauthorized: false,
        },
        (res) => {
          if (expectFingerprint && res.socket) {
            const cert = (res.socket as import('node:tls').TLSSocket).getPeerCertificate();
            if (cert?.raw) {
              const fp = createHash('sha256').update(cert.raw).digest('hex');
              if (fp !== expectFingerprint) {
                reject(new Error('证书指纹不匹配'));
                res.resume();
                return;
              }
            }
          }
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            try {
              resolve(JSON.parse(text) as T);
            } catch {
              reject(new Error(`bad json: ${text.slice(0, 200)}`));
            }
          });
        },
      );
      req.on('error', reject);
      if (this.abort) {
        this.abort.signal.addEventListener('abort', () => {
          req.destroy(new Error('cancelled'));
        });
      }
      if (payload) req.write(payload);
      req.end();
    });
  }
}
