# Electron Framework Integration

## Overview

The NAS Shipping Estimator was converted from a browser-only Vite + React web application to an **Electron desktop application**. This change allows the app to run as a standalone program on users' Windows machines with full access to the local file system for persistent data storage.

The application retains full backward compatibility — it can still run in a standard web browser, where it falls back to `localStorage` for persistence.

---

## Motivation

The original app stored all user data (Product Library, Saved Plans, Auto-save state, Custom Trailers) in the browser's `localStorage`. This approach had several risks:

- **Data loss** if the user clears browser data, cookies, or site storage
- **No portability** — data is locked to a single browser profile on a single machine
- **Storage limits** — `localStorage` is capped at ~5–10 MB per origin depending on the browser
- **No file system access** — impossible to read/write files without user interaction via the File System Access API (Chromium-only)

Wrapping the app in Electron solves all of these problems by providing native OS-level file access through a secure IPC bridge.

---

## Architecture

### Process Model

Electron uses a multi-process architecture:

```
┌──────────────────────────────────┐
│         Main Process             │
│   (electron/main.ts)             │
│                                  │
│  - Creates the app window        │
│  - Manages app lifecycle         │
│  - Handles file I/O via IPC      │
│  - Reads/writes JSON data files  │
│    in %APPDATA%                  │
└──────────────┬───────────────────┘
               │ IPC (contextBridge)
┌──────────────▼───────────────────┐
│       Preload Script             │
│   (electron/preload.ts)          │
│                                  │
│  - Exposes window.electronStorage│
│    API via contextBridge         │
│  - Bridges renderer ↔ main      │
└──────────────┬───────────────────┘
               │ window.electronStorage
┌──────────────▼───────────────────┐
│      Renderer Process            │
│   (src/ — React application)     │
│                                  │
│  - The full UI (unchanged)       │
│  - storage.ts abstraction layer  │
│    detects Electron vs browser   │
└──────────────────────────────────┘
```

### Security Model

The Electron configuration follows security best practices:

| Setting               | Value   | Purpose                                                 |
|-----------------------|---------|---------------------------------------------------------|
| `contextIsolation`    | `true`  | Renderer cannot access Node.js APIs directly            |
| `nodeIntegration`     | `false` | No `require()` or `fs` in renderer code                 |
| `contextBridge`       | Used    | Only the explicitly exposed `electronStorage` API is available |

The renderer process has **zero direct access** to Node.js or the file system. All storage operations go through the IPC bridge defined in the preload script.

---

## Files Added / Modified

### New Files

#### `electron/main.ts` — Main Process

The Electron main process. Responsibilities:

- **Window creation**: Opens a `BrowserWindow` (1400×900, min 1024×700) with the app title, icon, and the preload script.
- **Menu bar**: Hidden (`setMenuBarVisibility(false)`) for a cleaner UI.
- **Dev vs production**: In development, loads the Vite dev server URL (`process.env.VITE_DEV_SERVER_URL`). In production, loads the built `dist/index.html`.
- **IPC handlers** for file-based storage (see [Storage IPC Channels](#storage-ipc-channels) below).
- **App lifecycle**: Quits when all windows are closed. On macOS `activate`, recreates the window if none exist.

**Data directory**: `%APPDATA%/nas-shipping-estimator/data/` (created automatically if missing).

#### `electron/preload.ts` — Preload Script

Exposes a `window.electronStorage` API to the renderer via Electron's `contextBridge`:

```typescript
contextBridge.exposeInMainWorld('electronStorage', {
  get:         (key: string) => ipcRenderer.invoke('storage:get', key),
  set:         (key: string, value: string) => ipcRenderer.invoke('storage:set', key, value),
  remove:      (key: string) => ipcRenderer.invoke('storage:remove', key),
  getDataPath: () => ipcRenderer.invoke('storage:getDataPath'),
});
```

#### `electron/tsconfig.json` — Electron TypeScript Config

Separate TypeScript configuration for the Electron process files (`main.ts`, `preload.ts`):

- Target: `ES2023`
- Module: `ESNext`
- Types: `node` only (no DOM)
- Output: `dist-electron/`

### Modified Files

#### `src/storage.ts` — Storage Abstraction Layer

This is the core change. The storage module now provides a **dual-mode abstraction**:

1. **Electron mode**: Detected by `typeof window !== 'undefined' && !!window.electronStorage`. Data is read from and written to the file system via IPC.
2. **Browser mode**: Falls back to `localStorage` (original behavior).

**How it works in Electron mode:**

- **`initStorage()`** — Called once at app startup (before React renders). Loads all known storage keys from disk into an in-memory `cache` object via async IPC calls. This is the only async operation.
- **`storageGet(key)`** — Synchronous read from the in-memory cache. No IPC call needed.
- **`storageSet(key, value)`** — Synchronous write to cache + **fire-and-forget** async IPC call to flush to disk.
- **`storageRemove(key)`** — Synchronous cache delete + fire-and-forget async IPC call to remove the file.

This "cache + async flush" pattern means all existing consumers (Product Library, Saved Plans, Auto-save, Custom Trailers) continue to work without any changes — they call the same synchronous functions as before.

**Storage keys hydrated at init:**

| Key                       | Data                     |
|---------------------------|--------------------------|
| `naseco-product-library`  | Product Library items    |
| `naseco-saved-plans`      | Saved load plans         |
| `naseco-autosave`         | Current working state    |
| `naseco-custom-trailers`  | Custom trailer specs     |

#### `src/main.tsx` — App Entry Point

Now calls `initStorage()` before rendering the React tree:

```tsx
initStorage().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
```

In browser mode, `initStorage()` is a no-op that resolves immediately.

#### `index.html` — Service Worker Conditional

The service worker registration is now skipped when running inside Electron:

```javascript
if ('serviceWorker' in navigator && !window.electronStorage) {
  // register SW only in browser mode
}
```

Service workers are unnecessary in Electron — the app loads from local files, not a remote server.

#### `vite.config.ts` — Vite Plugins

Added two plugins:

```typescript
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
```

- **`vite-plugin-electron`**: Compiles `electron/main.ts` and `electron/preload.ts` into `dist-electron/` during both dev and production builds. In dev mode, it also starts the Electron process automatically when Vite's dev server is ready.
- **`vite-plugin-electron-renderer`**: Allows the renderer process to use Node.js built-in modules if needed (via polyfills/shimming).

#### `package.json` — Dependencies & Build Config

**New dependencies:**

| Package                          | Type | Purpose                                        |
|----------------------------------|------|------------------------------------------------|
| `electron`                       | dev  | The Electron runtime                           |
| `electron-builder`               | dev  | Packages the app into a Windows installer      |
| `vite-plugin-electron`           | dev  | Vite integration for Electron main/preload     |
| `vite-plugin-electron-renderer`  | dev  | Vite integration for Electron renderer process |

**New/changed fields:**

```json
{
  "main": "dist-electron/main.js",
  "scripts": {
    "build:electron": "npm run build && electron-builder"
  },
  "build": {
    "appId": "com.naseco.shipping-estimator",
    "productName": "NAS Shipping Estimator",
    "directories": { "output": "release" },
    "files": ["dist/**/*", "dist-electron/**/*"],
    "win": {
      "target": "nsis",
      "icon": "public/NAS_Icon.png"
    },
    "nsis": {
      "oneClick": false,
      "perMachine": true,
      "allowToChangeInstallationDirectory": true
    }
  }
}
```

---

## Storage IPC Channels

| Channel              | Direction        | Parameters           | Returns          | Description                          |
|----------------------|------------------|----------------------|------------------|--------------------------------------|
| `storage:get`        | Renderer → Main  | `key: string`        | `string \| null` | Read a JSON file from the data dir   |
| `storage:set`        | Renderer → Main  | `key, value: string` | `boolean`        | Write a JSON file to the data dir    |
| `storage:remove`     | Renderer → Main  | `key: string`        | `boolean`        | Delete a JSON file from the data dir |
| `storage:getDataPath`| Renderer → Main  | (none)               | `string`         | Returns the absolute data dir path   |

**Key sanitization**: Storage keys are converted to safe filenames by replacing any character that isn't `a-zA-Z0-9_-` with an underscore. For example, `naseco-product-library` becomes `naseco-product-library.json`.

---

## Data Storage Location

All application data is stored as individual JSON files in:

```
%APPDATA%\nas-shipping-estimator\data\
```

Typical resolved path on Windows:

```
C:\Users\<username>\AppData\Roaming\nas-shipping-estimator\data\
```

Files stored:

```
naseco-product-library.json
naseco-saved-plans.json
naseco-autosave.json
naseco-custom-trailers.json
```

This directory is created automatically on first launch if it doesn't exist.

---

## Development Workflow

### Running in Dev Mode

```bash
cd app
npm run dev
```

This starts:
1. Vite dev server (hot module replacement for React code)
2. Electron main process (auto-launched by `vite-plugin-electron`)
3. Preload script (auto-reloads on changes)

Changes to React code hot-reload instantly. Changes to `electron/main.ts` require a restart. Changes to `electron/preload.ts` trigger an automatic reload.

### Building a Production Installer

```bash
cd app
npm run build:electron
```

This runs:
1. `tsc -b` — TypeScript type checking
2. `vite build` — Bundles the React app into `dist/` and Electron files into `dist-electron/`
3. `electron-builder` — Packages everything into an NSIS Windows installer

Output: `app/release/` directory containing the `.exe` installer.

### NSIS Installer Configuration

- **Not one-click**: Shows an installation wizard
- **Per-machine install**: Installs for all users (requires admin)
- **Custom install directory**: User can choose where to install

---

## Backward Compatibility

The app remains fully functional in a standard web browser:

- `initStorage()` is a no-op (resolves immediately)
- `storageGet/Set/Remove` fall back to `localStorage`
- Service worker registers normally
- No Electron-specific code runs in the renderer

This means developers can still use `npm run dev` and open `http://localhost:5173` in a browser for quick iteration without Electron, though the default dev workflow now launches Electron automatically.
