# LanDrop Architecture

## 分层

```
src/                  React UI（设备 / 连接 / 设置 / 帮助）
electron/preload.ts   contextBridge IPC
electron/main.ts      窗口 + 托盘 + 生命周期
electron/ipc/         IPC 编排
electron/discovery/   UDP 组播发现
electron/transfer/    HTTPS 收发（协议实现）
electron/cert/        自签身份
electron/settings/    userData JSON
shared/               品牌 + 协议类型 + 网卡启发式（可迁出）
```

## 进程职责

| 进程 | 职责 |
|------|------|
| Main | 托盘常驻、单实例、发现、HTTPS 服务、文件对话框、接收确认 dialog |
| Preload | 暴露 `window.lanDrop` |
| Renderer | UI；不直接碰 Node `net`/`fs` |

## 白标预留

`shared/brand.ts` 集中：`appId` / `appName` / 默认端口 / 组播 / API 前缀。  
打包 `appId` / `productName` 见根 `package.json` → `build`。

## 里程碑对应

| M | 内容 |
|---|------|
| M0 | 壳 + 托盘 |
| M1 | 发现 + 网卡设置 + 设备列表 |
| M2 | prepare/upload + 确认 + 进度取消 |
| M3 | 文件夹 + QR/IP + 帮助 + electron-builder `--dir` |
| M4 | 本文 + PROTOCOL；暂不迁 sa2kit（评估：协议稳定且有第二宿主时再迁） |

## sa2kit 迁移评估（M4）

**现在不迁。** 原因：仅 Electron 一个宿主；`https`/`dgram` 与 Node 绑定；过早进 `sa2kit` 会拖库发布节奏。  
**何时迁**：出现 Tauri/CLI 第二宿主，或接单要复用同一协议 SDK 时，将 `shared` + discovery/transfer（去 Electron dialog）抽成 `sa2kit` 模块，壳只留 IPC。
