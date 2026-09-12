import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  const bridge = typeof window !== 'undefined' ? window.lanDrop : undefined;

  return (
    <div className="app">
      <header className="app-header">
        <h1>LanDrop</h1>
        <span className="badge">M0</span>
      </header>

      <section className="panel">
        <h2>空壳已就绪</h2>
        <p>
          系统托盘常驻：关闭窗口会隐藏到托盘，从托盘「退出」才会结束进程。发现与互传将在
          M1 / M2 接入。
        </p>
        <ul className="meta">
          <li>
            <strong>平台</strong>
            {bridge?.platform ?? '…'}
          </li>
          <li>
            <strong>Electron</strong>
            {bridge?.versions.electron ?? '…'}
          </li>
          <li>
            <strong>Node</strong>
            {bridge?.versions.node ?? '…'}
          </li>
        </ul>
      </section>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
