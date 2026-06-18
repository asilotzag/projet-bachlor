import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';

/**
 * Processus PRINCIPAL d'Electron (concept #1).
 * Rôle : créer la fenêtre native et y charger l'interface React.
 * - En développement  : on charge le serveur Vite (http://localhost:5173).
 * - En production      : on charge les fichiers React compilés (file://).
 */

const DEV_SERVER_URL = 'http://localhost:5173';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    title: "Gestion d'Entreprise",
    webPreferences: {
      // Concept #2 : le PRELOAD est le pont sécurisé entre Electron et React.
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    win.loadURL(DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(process.resourcesPath, 'web', 'index.html'));
  }
}

app.whenReady().then(() => {
  // Concept #3 : l'IPC permet au React d'appeler le processus principal.
  ipcMain.handle('app:info', () => ({
    platform: process.platform,
    version: app.getVersion(),
  }));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
