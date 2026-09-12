import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dialog, type BrowserWindow } from 'electron';
import { BRAND } from '../../shared/brand';
import type {
  PrepareRequest,
  PrepareResponse,
  TransferProgress,
  TransferSessionState,
} from '../../shared/protocol';
import { shortFingerprint } from '../../shared/protocol';
import type { DeviceIdentity } from '../cert/identity';
import { loadSettings, updateSettings } from '../settings/store';
import { safeResolveDownloadPath } from './paths';

type AcceptFn = (req: PrepareRequest) => Promise<'accept' | 'reject'>;

interface ActiveSession {
  req: PrepareRequest;
  tokens: Record<string, string>;
  received: Set<string>;
  cancelled: boolean;
  overallDone: number;
  overallTotal: number;
}

export class ReceiveServer extends EventEmitter {
  private server: https.Server | null = null;
  private identity: DeviceIdentity;
  private getWindow: () => BrowserWindow | null;
  private session: ActiveSession | null = null;
  private acceptHandler: AcceptFn;

  constructor(
    identity: DeviceIdentity,
    getWindow: () => BrowserWindow | null,
    acceptHandler?: AcceptFn,
  ) {
    super();
    this.identity = identity;
    this.getWindow = getWindow;
    this.acceptHandler = acceptHandler ?? ((req) => this.defaultAccept(req));
  }

  async start(): Promise<void> {
    if (this.server) return;
    const settings = loadSettings();
    fs.mkdirSync(settings.downloadDir, { recursive: true });

    this.server = https.createServer(
      { key: this.identity.keyPem, cert: this.identity.certPem },
      (req, res) => {
        void this.handle(req, res);
      },
    );

    const preferred = settings.httpsPort;
    const candidates = [preferred, preferred + 1, preferred + 2, preferred + 3, 0];
    let lastErr: unknown;
    for (const port of candidates) {
      try {
        await new Promise<void>((resolve, reject) => {
          const onError = (err: Error) => {
            this.server?.off('listening', onListening);
            reject(err);
          };
          const onListening = () => {
            this.server?.off('error', onError);
            resolve();
          };
          this.server!.once('error', onError);
          this.server!.once('listening', onListening);
          this.server!.listen(port, '0.0.0.0');
        });
        const addr = this.server.address();
        const bound =
          addr && typeof addr === 'object' ? addr.port : port;
        if (bound !== preferred) {
          console.warn(
            `[LanDrop] HTTPS port ${preferred} busy, bound to ${bound}`,
          );
          updateSettings({ httpsPort: bound });
        }
        return;
      } catch (err) {
        lastErr = err;
        try {
          this.server.close();
        } catch {
          /* ignore */
        }
        this.server = https.createServer(
          { key: this.identity.keyPem, cert: this.identity.certPem },
          (req, res) => {
            void this.handle(req, res);
          },
        );
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  async stop(): Promise<void> {
    const s = this.server;
    this.server = null;
    if (!s) return;
    await new Promise<void>((resolve) => s.close(() => resolve()));
  }

  cancelActive(): void {
    if (!this.session) return;
    this.session.cancelled = true;
    this.emitState({
      sessionId: this.session.req.sessionId,
      direction: 'receive',
      peerName: this.session.req.sender.displayName,
      status: 'cancelled',
    });
    this.session = null;
  }

  private async defaultAccept(req: PrepareRequest): Promise<'accept' | 'reject'> {
    const win = this.getWindow();
    const total = req.files.reduce((a, f) => a + f.size, 0);
    const lines = req.files
      .slice(0, 8)
      .map((f) => `• ${f.relativePath} (${formatBytes(f.size)})`)
      .join('\n');
    const more = req.files.length > 8 ? `\n…共 ${req.files.length} 个文件` : '';
    const detail =
      `来自：${req.sender.displayName}\n` +
      `指纹：${shortFingerprint(req.sender.fingerprint)}\n` +
      `合计：${formatBytes(total)}\n\n${lines}${more}`;

    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
    }

    const opts = {
      type: 'question' as const,
      buttons: ['接受', '拒绝'],
      defaultId: 0,
      cancelId: 1,
      title: `${BRAND.appName} — 接收确认`,
      message: '是否接收这些文件？',
      detail,
      noLink: true,
    };
    const result =
      win && !win.isDestroyed()
        ? await dialog.showMessageBox(win, opts)
        : await dialog.showMessageBox(opts);
    return result.response === 0 ? 'accept' : 'reject';
  }

  private emitState(state: TransferSessionState): void {
    this.emit('session', state);
  }

  private emitProgress(p: TransferProgress): void {
    this.emit('progress', p);
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url || '/', `https://localhost`);
      const prefix = BRAND.apiPrefix;

      if (req.method === 'GET' && url.pathname === `${prefix}/info`) {
        const s = loadSettings();
        return json(res, 200, {
          v: BRAND.protocolVersion,
          deviceId: s.deviceId,
          displayName: s.displayName,
          port: s.httpsPort,
          fingerprint: this.identity.fingerprint,
          os: process.platform,
          receivePaused: s.receivePaused,
        });
      }

      if (req.method === 'POST' && url.pathname === `${prefix}/prepare`) {
        return void (await this.handlePrepare(req, res));
      }

      if (req.method === 'POST' && url.pathname === `${prefix}/upload`) {
        return void (await this.handleUpload(req, res, url));
      }

      if (req.method === 'POST' && url.pathname === `${prefix}/cancel`) {
        this.cancelActive();
        return json(res, 200, { ok: true });
      }

      json(res, 404, { error: 'not_found' });
    } catch (err) {
      json(res, 500, { error: String(err) });
    }
  }

  private async handlePrepare(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJson<PrepareRequest>(req);
    const settings = loadSettings();

    if (settings.receivePaused) {
      const resp: PrepareResponse = { ok: false, reason: 'paused' };
      return json(res, 403, resp);
    }

    if (this.session) {
      const resp: PrepareResponse = { ok: false, reason: 'busy' };
      return json(res, 409, resp);
    }

    this.emitState({
      sessionId: body.sessionId,
      direction: 'receive',
      peerName: body.sender.displayName,
      status: 'waiting',
    });

    const decision = await this.acceptHandler(body);
    if (decision !== 'accept') {
      this.emitState({
        sessionId: body.sessionId,
        direction: 'receive',
        peerName: body.sender.displayName,
        status: 'cancelled',
        message: '已拒绝',
      });
      const resp: PrepareResponse = { ok: false, reason: 'rejected' };
      return json(res, 403, resp);
    }

    const tokens: Record<string, string> = {};
    for (const f of body.files) tokens[f.id] = randomUUID();

    const overallTotal = body.files.reduce((a, f) => a + f.size, 0);
    this.session = {
      req: body,
      tokens,
      received: new Set(),
      cancelled: false,
      overallDone: 0,
      overallTotal,
    };

    this.emitState({
      sessionId: body.sessionId,
      direction: 'receive',
      peerName: body.sender.displayName,
      status: 'transferring',
    });

    const resp: PrepareResponse = { ok: true, tokens };
    json(res, 200, resp);
  }

  private async handleUpload(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    const session = this.session;
    if (!session || session.cancelled) {
      return json(res, 409, { error: 'no_session' });
    }

    const fileId = url.searchParams.get('fileId') || '';
    const token = url.searchParams.get('token') || '';
    const meta = session.req.files.find((f) => f.id === fileId);
    if (!meta || session.tokens[fileId] !== token) {
      return json(res, 403, { error: 'bad_token' });
    }

    const settings = loadSettings();
    const target = safeResolveDownloadPath(settings.downloadDir, meta.relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });

    const tmp = `${target}.landrop.partial`;
    const stream = fs.createWriteStream(tmp);
    let fileDone = 0;

    try {
      await new Promise<void>((resolve, reject) => {
        req.on('data', (chunk: Buffer) => {
          if (session.cancelled) {
            req.destroy();
            reject(new Error('cancelled'));
            return;
          }
          fileDone += chunk.length;
          session.overallDone += chunk.length;
          stream.write(chunk);
          this.emitProgress({
            sessionId: session.req.sessionId,
            direction: 'receive',
            fileId,
            relativePath: meta.relativePath,
            bytesDone: fileDone,
            bytesTotal: meta.size,
            filesDone: session.received.size,
            filesTotal: session.req.files.length,
            overallDone: session.overallDone,
            overallTotal: session.overallTotal,
          });
        });
        req.on('end', () => {
          stream.end(() => resolve());
        });
        req.on('error', reject);
        stream.on('error', reject);
      });

      if (session.cancelled) {
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* ignore */
        }
        return json(res, 499, { error: 'cancelled' });
      }

      fs.renameSync(tmp, target);
      session.received.add(fileId);

      this.emitProgress({
        sessionId: session.req.sessionId,
        direction: 'receive',
        fileId,
        relativePath: meta.relativePath,
        bytesDone: meta.size,
        bytesTotal: meta.size,
        filesDone: session.received.size,
        filesTotal: session.req.files.length,
        overallDone: session.overallDone,
        overallTotal: session.overallTotal,
      });

      if (session.received.size >= session.req.files.length) {
        this.emitState({
          sessionId: session.req.sessionId,
          direction: 'receive',
          peerName: session.req.sender.displayName,
          status: 'done',
        });
        this.session = null;
      }

      json(res, 200, { ok: true });
    } catch (err) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      if (session.cancelled) {
        this.session = null;
        return json(res, 499, { error: 'cancelled' });
      }
      this.emitState({
        sessionId: session.req.sessionId,
        direction: 'receive',
        peerName: session.req.sender.displayName,
        status: 'error',
        message: String(err),
      });
      this.session = null;
      json(res, 500, { error: String(err) });
    }
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const data = Buffer.from(JSON.stringify(body), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
  });
  res.end(data);
}

function readJson<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}
