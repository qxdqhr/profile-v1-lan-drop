/// <reference types="vite/client" />

interface LanDropBridge {
  platform: NodeJS.Platform;
  versions: {
    electron: string;
    node: string;
    chrome: string;
  };
}

declare global {
  interface Window {
    lanDrop: LanDropBridge;
  }
}

export {};
