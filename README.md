# LanDrop

局域网设备发现与文件互传桌面端（Windows / macOS / Linux）。

- 父仓：`app_desktop/lan-drop`（profile-v1 submodule）
- 需求：[profile-v1 `docs/modules/lan-drop/REQUIREMENTS.md`](https://github.com/qxdqhr/profile-v1/blob/main/docs/modules/lan-drop/REQUIREMENTS.md)
- 协议：[docs/PROTOCOL.md](./docs/PROTOCOL.md)
- 架构：[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)

## 功能（V1）

- UDP 组播发现同款设备；网卡选择；IP / `landrop://` 链接 / 二维码兜底
- HTTPS 多文件与文件夹互传；接收确认；进度与取消；单接收会话
- 系统托盘常驻；暂停接收

## 开发

在 **profile-v1 父仓根目录**：

```bash
git submodule update --init --recursive
pnpm install
pnpm dev:lan-drop
```

## 打包冒烟

当前平台目录产物：

```bash
cd app_desktop/lan-drop
pnpm dist:dir
```

**Windows 便携包**（可在 macOS 上交叉编译 x64 portable `.exe`）：

```bash
cd app_desktop/lan-drop
# 国内网络建议加镜像，否则下载 Electron/win 工具链容易卡住
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
export CSC_IDENTITY_AUTO_DISCOVERY=false
pnpm dist:win
```

产物：`release/LanDrop-0.1.0-win-x64.exe`（免安装便携包，拷到 Windows 直接运行）。
未签名安装包；正式发布再补图标与签名。

## 包名

`@profile/lan-drop`
