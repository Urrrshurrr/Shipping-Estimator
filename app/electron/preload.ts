import { contextBridge, ipcRenderer } from 'electron';

/**
 * Expose a safe `electronStorage` API to the renderer process.
 * This replaces localStorage with file-system-backed storage
 * via IPC calls to the main process.
 */
contextBridge.exposeInMainWorld('electronStorage', {
  get: (key: string): Promise<string | null> =>
    ipcRenderer.invoke('storage:get', key),
  set: (key: string, value: string): Promise<boolean> =>
    ipcRenderer.invoke('storage:set', key, value),
  remove: (key: string): Promise<boolean> =>
    ipcRenderer.invoke('storage:remove', key),
  getDataPath: (): Promise<string> =>
    ipcRenderer.invoke('storage:getDataPath'),
});

contextBridge.exposeInMainWorld('appRuntime', {
  isElectron: true,
});
