import { BrowserWindow as e, app as t, ipcMain as n } from "electron";
import r from "node:path";
import i from "node:fs";
import { fileURLToPath as a } from "node:url";
//#region electron/main.ts
var o = a(import.meta.url), s = r.dirname(o), c = r.join(t.getPath("userData"), "data");
i.existsSync(c) || i.mkdirSync(c, { recursive: !0 });
var l = r.join(s, "../dist"), u = process.env.VITE_DEV_SERVER_URL, d = null;
function f() {
	d = new e({
		width: 1050,
		height: 900,
		minWidth: 1024,
		minHeight: 700,
		title: "NAS Shipping Estimator",
		icon: r.join(s, "../public/NAS_Icon.png"),
		webPreferences: {
			preload: r.join(s, "preload.js"),
			contextIsolation: !0,
			nodeIntegration: !1
		}
	}), d.setMenuBarVisibility(!1), u ? d.loadURL(u) : d.loadFile(r.join(l, "index.html"));
}
function p(e) {
	let t = e.replace(/[^a-zA-Z0-9_-]/g, "_");
	return r.join(c, `${t}.json`);
}
n.handle("storage:get", (e, t) => {
	let n = p(t);
	if (!i.existsSync(n)) return null;
	try {
		return i.readFileSync(n, "utf-8");
	} catch {
		return null;
	}
}), n.handle("storage:set", (e, t, n) => {
	try {
		return i.writeFileSync(p(t), n, "utf-8"), !0;
	} catch {
		return !1;
	}
}), n.handle("storage:remove", (e, t) => {
	let n = p(t);
	return i.existsSync(n) && i.unlinkSync(n), !0;
}), n.handle("storage:getDataPath", () => c), t.whenReady().then(f), t.on("window-all-closed", () => {
	t.quit();
}), t.on("activate", () => {
	e.getAllWindows().length === 0 && f();
});
//#endregion
