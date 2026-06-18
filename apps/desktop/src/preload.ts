import { contextBridge, ipcRenderer } from 'electron';

/**
 * PRELOAD (concept #2) : expose une API sûre et limitée à l'interface React,
 * sans donner accès à tout Node.js (sécurité). Accessible via `window.desktop`.
 */
contextBridge.exposeInMainWorld('desktop', {
  getAppInfo: (): Promise<{ platform: string; version: string }> =>
    ipcRenderer.invoke('app:info'),
});
