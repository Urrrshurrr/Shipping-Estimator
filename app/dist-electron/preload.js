import { contextBridge, ipcRenderer } from "electron";
//#region electron/preload.ts
/**
* Expose a safe `electronStorage` API to the renderer process.
* This replaces localStorage with file-system-backed storage
* via IPC calls to the main process.
*/
contextBridge.exposeInMainWorld("electronStorage", {
	get: (key) => ipcRenderer.invoke("storage:get", key),
	set: (key, value) => ipcRenderer.invoke("storage:set", key, value),
	remove: (key) => ipcRenderer.invoke("storage:remove", key),
	getDataPath: () => ipcRenderer.invoke("storage:getDataPath")
});
contextBridge.exposeInMainWorld("appRuntime", { isElectron: true });
//#endregion
