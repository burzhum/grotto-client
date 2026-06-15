import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TelnetConnection } from './telnet.js';
import { loadConfig, saveConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let win = null;
const conn = new TelnetConnection();

function createWindow() {
  win = new BrowserWindow({
    width: 1000, height: 700, backgroundColor: '#0b0e12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

conn.on('data', (t) => win?.webContents.send('telnet:data', t));
conn.on('status', (s) => win?.webContents.send('telnet:status', s));
conn.on('echo', (v) => win?.webContents.send('telnet:echo', v));

ipcMain.on('telnet:connect', (_e, { host, port }) => conn.connect(host, port));
ipcMain.on('telnet:send', (_e, text) => conn.send(text));
ipcMain.on('telnet:disconnect', () => conn.disconnect());
ipcMain.handle('config:load', () => loadConfig(app.getPath('userData'), safeStorage));
ipcMain.handle('config:save', (_e, cfg) => { saveConfig(app.getPath('userData'), cfg, safeStorage); return true; });

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { conn.disconnect(); if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
