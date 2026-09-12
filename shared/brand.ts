/** White-label reserved brand knobs (single brand in V1). */
export const BRAND = {
  appId: 'lan-drop',
  appName: 'LanDrop',
  protocolScheme: 'landrop',
  protocolVersion: 1,
  apiPrefix: '/landrop/v1',
  defaultHttpsPort: 41235,
  multicastAddress: '239.255.90.90',
  multicastPort: 41234,
  announceIntervalMs: 2000,
  peerTtlMs: 8000,
} as const;
