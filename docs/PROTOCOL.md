# LanDrop Protocol v1

自定义局域网协议（**不**兼容 LocalSend）。语义参考「发现 → 元数据确认 → 流式上传」。

## 常量

| 项 | 默认 |
|----|------|
| 协议版本 `v` | `1` |
| UDP 组播 | `239.255.90.90:41234` |
| HTTPS API | `https://<ip>:<port>/landrop/v1/*`（默认端口 `41235`） |
| 连接 URL | `landrop://connect?v=1&ip=&port=&fingerprint=&name=` |

端口与组播可在设置中改 HTTPS 端口；组播地址见 `shared/brand.ts`。

## 发现

1. 周期性发送 JSON `PeerAnnounce`（`v`, `deviceId`, `displayName`, `port`, `fingerprint`, `os`, `ip`）：
   - **UDP 组播** `239.255.90.90:41234`（按本地各网卡 `setMulticastInterface` 分别发送）
   - **子网广播**（各网卡 broadcast + `255.255.255.255`）作兜底
2. 监听绑定 `0.0.0.0:41234`，并在各局域网网卡上 `addMembership`
3. 超时 TTL（默认 8s）剔除非手动条目
4. 手动添加：对 `GET /landrop/v1/info` 探测后写入 peer（`manual: true`）

## HTTPS API

接收方起自签证书 HTTPS 服务。

### `GET /landrop/v1/info`

返回设备信息与 `receivePaused`。

### `POST /landrop/v1/prepare`

Body：`PrepareRequest`（`sessionId`, `sender`, `files[]`）。

行为：

- 若暂停接收 → `{ ok:false, reason:'paused' }`
- 若已有接收会话 → `{ ok:false, reason:'busy' }`
- 否则弹窗确认；拒绝 → `{ ok:false, reason:'rejected' }`
- 接受 → `{ ok:true, tokens: { [fileId]: token } }`，并锁定会话

### `POST /landrop/v1/upload?fileId=&token=`

Body：原始文件字节流。写入配置的下载目录，保留 `relativePath` 相对结构。

### `POST /landrop/v1/cancel`

取消当前接收会话。

## 安全

- 传输 TLS（自签）；证书 SHA-256 指纹在发现与 UI 中展示。
- 发送方可在 TLS 握手后校验对端指纹是否与发现信息一致。
- 无账号；接收必须人工确认。

## 代码边界

纯协议类型与品牌常量：`shared/`。  
实现：`electron/discovery`、`electron/transfer`、`electron/cert`。  
**无 Electron 依赖**的目标态：日后可将 `shared` + 传输/发现实现迁入 `sa2kit`；当前 Electron 仅作壳与 IPC。
