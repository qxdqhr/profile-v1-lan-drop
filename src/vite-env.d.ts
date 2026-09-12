/// <reference types="vite/client" />

import type { LanDropApi } from './preload-api';

declare global {
  interface Window {
    lanDrop: LanDropApi;
  }
}

export {};
