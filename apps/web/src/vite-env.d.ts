/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** API exposée par le preload Electron (window.desktop). */
interface Window {
  desktop?: {
    getAppInfo: () => Promise<{ platform: string; version: string }>;
  };
}
