import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { PeerInfo, TransferProgress, TransferSessionState } from '../shared/protocol';
import { shortFingerprint } from '../shared/protocol';
import './styles.css';

type Tab = 'devices' | 'connect' | 'settings' | 'help';

interface Snapshot {
  brand: { appName: string; defaultHttpsPort: number; multicastAddress: string; multicastPort: number };
  settings: {
    displayName: string;
    httpsPort: number;
    bindAddress: string;
    downloadDir: string;
    receivePaused: boolean;
  };
  identity: { fingerprint: string; shortFingerprint: string };
  bindAddress: string;
  interfaces: { name: string; address: string; internal: boolean }[];
  peers: PeerInfo[];
  connectUrl: string;
  platform: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function App() {
  const [tab, setTab] = useState<Tab>('devices');
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingPaths, setPendingPaths] = useState<string[]>([]);
  const [session, setSession] = useState<TransferSessionState | null>(null);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectInput, setConnectInput] = useState('');
  const [qr, setQr] = useState<{ url: string; dataUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!window.lanDrop) {
      setError('preload 未注入（window.lanDrop 缺失），请重启应用');
      return;
    }
    const s = (await window.lanDrop.getSnapshot()) as Snapshot;
    setSnap(s);
    setPeers(s.peers);
  }, []);

  useEffect(() => {
    if (!window.lanDrop) {
      setError('preload 未注入（window.lanDrop 缺失），请重启应用');
      return;
    }
    void reload();
    void window.lanDrop.getConnectQr().then(setQr);
    const offPeers = window.lanDrop.onPeers(setPeers);
    const offSession = window.lanDrop.onSession(setSession);
    const offProgress = window.lanDrop.onProgress(setProgress);
    const offSettings = window.lanDrop.onSettingsChanged(() => {
      void reload();
    });
    return () => {
      offPeers();
      offSession();
      offProgress();
      offSettings();
    };
  }, [reload]);

  const selected = useMemo(
    () => peers.find((p) => p.deviceId === selectedId) ?? null,
    [peers, selectedId],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = [...e.dataTransfer.files];
    const paths = files
      .map((f) => {
        try {
          return window.lanDrop.getPathForFile(f);
        } catch {
          return '';
        }
      })
      .filter(Boolean);
    if (paths.length) setPendingPaths((prev) => [...prev, ...paths]);
  };

  async function sendNow() {
    if (!selected || pendingPaths.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await window.lanDrop.send(selected.deviceId, pendingPaths);
      setPendingPaths([]);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function addPeer() {
    setBusy(true);
    setError(null);
    try {
      const peer = (await window.lanDrop.addPeerByInput(connectInput)) as PeerInfo;
      setSelectedId(peer.deviceId);
      setConnectInput('');
      setTab('devices');
      await reload();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!snap) {
    return (
      <div className="app loading">
        {error ? (
          <div className="banner error" role="alert">
            {error}
          </div>
        ) : (
          '加载中…'
        )}
      </div>
    );
  }

  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <header className="app-header">
        <div>
          <h1>{snap.brand.appName}</h1>
          <p className="sub">
            {snap.settings.displayName} · {snap.bindAddress}:{snap.settings.httpsPort} · 指纹{' '}
            {snap.identity.shortFingerprint}
            {snap.settings.receivePaused ? ' · 已暂停接收' : ''}
          </p>
        </div>
        <nav className="tabs">
          {(
            [
              ['devices', '设备'],
              ['connect', '连接'],
              ['settings', '设置'],
              ['help', '帮助'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'tab active' : 'tab'}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <div className="banner error" role="alert">
          {error}
          <button type="button" className="linkish" onClick={() => setError(null)}>
            关闭
          </button>
        </div>
      )}

      {(session || progress) && (
        <section className="panel transfer-panel">
          <div className="row between">
            <strong>
              {session?.direction === 'receive' ? '接收' : '发送'}
              {session ? ` · ${session.peerName}` : ''} · {session?.status ?? ''}
            </strong>
            {(session?.status === 'transferring' ||
              session?.status === 'waiting' ||
              session?.status === 'preparing') && (
              <button type="button" className="btn danger" onClick={() => void window.lanDrop.cancelTransfer()}>
                取消
              </button>
            )}
            {session?.status === 'done' && (
              <button type="button" className="btn" onClick={() => void window.lanDrop.openDownloadDir()}>
                打开下载目录
              </button>
            )}
          </div>
          {progress && (
            <>
              <p className="muted">
                {progress.relativePath} · {formatBytes(progress.bytesDone)} /{' '}
                {formatBytes(progress.bytesTotal)}
              </p>
              <div className="bar">
                <div
                  className="bar-fill"
                  style={{
                    width: `${progress.overallTotal ? (100 * progress.overallDone) / progress.overallTotal : 0}%`,
                  }}
                />
              </div>
              <p className="muted">
                总体 {formatBytes(progress.overallDone)} / {formatBytes(progress.overallTotal)} · 文件{' '}
                {progress.filesDone}/{progress.filesTotal}
              </p>
            </>
          )}
          {session?.message && <p className="muted">{session.message}</p>}
        </section>
      )}

      {tab === 'devices' && (
        <div className="grid-2">
          <section className="panel">
            <div className="row between">
              <h2>局域网设备</h2>
              <button
                type="button"
                className="btn ghost"
                onClick={() => void window.lanDrop.refreshPeers().then(setPeers)}
              >
                刷新
              </button>
            </div>
            {peers.length === 0 ? (
              <p className="muted">未发现设备。可到「连接」用 IP / 粘贴链接兜底。</p>
            ) : (
              <ul className="peer-list">
                {peers.map((p) => (
                  <li key={p.deviceId}>
                    <button
                      type="button"
                      className={selectedId === p.deviceId ? 'peer active' : 'peer'}
                      onClick={() => setSelectedId(p.deviceId)}
                    >
                      <span className="peer-name">
                        {p.displayName}
                        {p.manual ? ' · 手动' : ''}
                      </span>
                      <span className="peer-meta">
                        {p.ip}:{p.port} · {p.os} · {shortFingerprint(p.fingerprint)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2>发送到所选设备</h2>
            {selected ? (
              <p className="muted">
                目标：{selected.displayName}（{selected.ip}:{selected.port}）
              </p>
            ) : (
              <p className="muted">请先选择左侧设备</p>
            )}
            <div className="row gap">
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const paths = await window.lanDrop.pickFiles();
                  if (paths.length) setPendingPaths((p) => [...p, ...paths]);
                }}
              >
                选文件
              </button>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const paths = await window.lanDrop.pickFolder();
                  if (paths.length) setPendingPaths((p) => [...p, ...paths]);
                }}
              >
                选文件夹
              </button>
              <button type="button" className="btn ghost" onClick={() => setPendingPaths([])}>
                清空
              </button>
            </div>
            <ul className="path-list">
              {pendingPaths.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p className="muted">也可将文件拖进窗口</p>
            <button
              type="button"
              className="btn primary"
              disabled={!selected || pendingPaths.length === 0 || busy}
              onClick={() => void sendNow()}
            >
              {busy ? '发送中…' : '发送'}
            </button>
          </section>
        </div>
      )}

      {tab === 'connect' && (
        <div className="grid-2">
          <section className="panel">
            <h2>本机连接信息</h2>
            <p className="muted">对端可扫描二维码，或复制链接粘贴到「手动添加」。</p>
            {qr && (
              <>
                <img className="qr" src={qr.dataUrl} alt="LanDrop connect QR" />
                <code className="code-block">{qr.url}</code>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void navigator.clipboard.writeText(qr.url)}
                >
                  复制链接
                </button>
              </>
            )}
          </section>
          <section className="panel">
            <h2>手动添加</h2>
            <p className="muted">支持 `IP`、`IP:端口` 或 `landrop://connect?...` 链接。</p>
            <input
              className="input"
              value={connectInput}
              onChange={(e) => setConnectInput(e.target.value)}
              placeholder="192.168.1.10:41235"
            />
            <button type="button" className="btn primary" disabled={!connectInput || busy} onClick={() => void addPeer()}>
              探测并添加
            </button>
          </section>
        </div>
      )}

      {tab === 'settings' && (
        <section className="panel narrow">
          <h2>设置</h2>
          <label className="field">
            <span>显示名</span>
            <input
              className="input"
              defaultValue={snap.settings.displayName}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== snap.settings.displayName) {
                  void window.lanDrop.updateSettings({ displayName: v }).then(() => reload());
                }
              }}
            />
          </label>
          <label className="field">
            <span>HTTPS 端口</span>
            <input
              className="input"
              type="number"
              defaultValue={snap.settings.httpsPort}
              onBlur={(e) => {
                const port = Number(e.target.value);
                if (port > 0 && port !== snap.settings.httpsPort) {
                  void window.lanDrop.updateSettings({ httpsPort: port }).then(() => reload());
                }
              }}
            />
          </label>
          <label className="field">
            <span>网卡 / 绑定地址（空=自动）</span>
            <select
              className="input"
              value={snap.settings.bindAddress}
              onChange={(e) => {
                void window.lanDrop
                  .updateSettings({ bindAddress: e.target.value })
                  .then(() => {
                    void reload();
                    void window.lanDrop.getConnectQr().then(setQr);
                  });
              }}
            >
              <option value="">自动（{snap.bindAddress}）</option>
              {snap.interfaces
                .filter((i) => !i.internal)
                .map((i) => (
                  <option key={`${i.name}-${i.address}`} value={i.address}>
                    {i.name} — {i.address}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>下载目录</span>
            <div className="row gap">
              <code className="path-chip">{snap.settings.downloadDir}</code>
              <button
                type="button"
                className="btn"
                onClick={() => void window.lanDrop.pickDownloadDir().then(() => reload())}
              >
                更改
              </button>
              <button type="button" className="btn ghost" onClick={() => void window.lanDrop.openDownloadDir()}>
                打开
              </button>
            </div>
          </label>
          <label className="field row gap">
            <input
              type="checkbox"
              checked={snap.settings.receivePaused}
              onChange={(e) => {
                void window.lanDrop.setReceivePaused(e.target.checked).then(() => reload());
              }}
            />
            <span>暂停接收</span>
          </label>
        </section>
      )}

      {tab === 'help' && (
        <section className="panel narrow">
          <h2>帮助</h2>
          <ul className="help-list">
            <li>两端都需安装并运行 {snap.brand.appName}（托盘常驻即可）。</li>
            <li>
              自动发现使用 UDP 组播 {snap.brand.multicastAddress}:{snap.brand.multicastPort}{' '}
              + 子网广播；HTTPS 端口 {snap.brand.defaultHttpsPort}。请在防火墙放行这些 UDP/TCP 端口。
            </li>
            <li>
              Windows：首次运行若弹防火墙，勾选「专用网络」允许；或在「允许应用通过防火墙」中启用
              LanDrop。
            </li>
            <li>若路由器开启 AP / 客户端隔离，将无法互发现，请用「连接」页填对方 IP（设置页可看本机 IP）。</li>
            <li>多网卡或 VPN 时，在设置中手动选择与对方同一网段的网卡。</li>
            <li>接收前会弹窗确认；传输使用自签 HTTPS，可用指纹核对设备。</li>
            <li>同时仅支持一个接收会话；对方忙时请稍后重试。</li>
          </ul>
        </section>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
