# LanDrop

局域网设备发现与文件互传桌面端（Windows / macOS / Linux）。

父仓路径：`app_desktop/lan-drop`（profile-v1 submodule）。  
需求文档：[`docs/modules/lan-drop/REQUIREMENTS.md`](https://github.com/qxdqhr/profile-v1/blob/main/docs/modules/lan-drop/REQUIREMENTS.md)（在父仓）。

## 当前里程碑

**M0** — Electron + Vite + React 空壳，系统托盘常驻（关窗不退出）。

## 开发

在 **profile-v1 父仓根目录**：

```bash
git submodule update --init --recursive
pnpm install
pnpm dev:lan-drop
```

或在本目录：

```bash
pnpm install
pnpm dev
```

## 包名

`@profile/lan-drop`
