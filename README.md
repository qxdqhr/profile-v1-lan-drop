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

## 打包冒烟（当前平台目录产物）

```bash
cd app_desktop/lan-drop
pnpm dist:dir
```

产物在 `release/`（未签名安装包；CI/发布后补）。

## 包名

`@profile/lan-drop`
