/// <reference types="vite/client" />

import type { LanDropApi } from '../electron/preload';

declare global {
  interface Window {
    lanDrop: LanDropApi;
  }
}

export {};
