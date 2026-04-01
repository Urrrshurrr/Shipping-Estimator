import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Paths ────────────────────────────────────────────────
const DATA_DIR = path.join(app.getPath('userData'), 'data');

// Ensure the data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// The built directory structure:
//   ├── dist-electron/   (Electron main + preload)
//   ├── dist/            (Vite renderer output)
const RENDERER_DIST = path.join(__dirname, '../dist');
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'NAS Shipping Estimator',
    icon: path.join(__dirname, '../public/NAS_Icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Remove the default menu bar
  mainWindow.setMenuBarVisibility(false);

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

// ── IPC: File-based storage ──────────────────────────────
function storagePath(key: string): string {
  // Sanitise the key to a safe filename
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(DATA_DIR, `${safe}.json`);
}

ipcMain.handle('storage:get', (_event, key: string) => {
  const file = storagePath(key);
  if (!fs.existsSync(file)) return null;
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
});

ipcMain.handle('storage:set', (_event, key: string, value: string) => {
  try {
    fs.writeFileSync(storagePath(key), value, 'utf-8');
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('storage:remove', (_event, key: string) => {
  const file = storagePath(key);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
  return true;
});

ipcMain.handle('storage:getDataPath', () => DATA_DIR);

// ── App lifecycle ────────────────────────────────────────
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
