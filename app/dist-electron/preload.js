import { contextBridge as e, ipcRenderer as t } from "electron";
e.exposeInMainWorld("electronStorage", {
	get: (e) => t.invoke("storage:get", e),
	set: (e, n) => t.invoke("storage:set", e, n),
	remove: (e) => t.invoke("storage:remove", e),
	getDataPath: () => t.invoke("storage:getDataPath")
}), e.exposeInMainWorld("appRuntime", { isElectron: !0 });
//#endregion
