import { BrowserWindow, app, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
//#region electron/main.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var DATA_DIR = path.join(app.getPath("userData"), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
var RENDERER_DIST = path.join(__dirname, "../dist");
var VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
var mainWindow = null;
function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1050,
		height: 900,
		minWidth: 1024,
		minHeight: 700,
		title: "NAS Shipping Estimator",
		icon: path.join(__dirname, "../public/NAS_Icon.png"),
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false
		}
	});
	mainWindow.setMenuBarVisibility(false);
	if (VITE_DEV_SERVER_URL) mainWindow.loadURL(VITE_DEV_SERVER_URL);
	else mainWindow.loadFile(path.join(RENDERER_DIST, "index.html"));
}
function storagePath(key) {
	const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_");
	return path.join(DATA_DIR, `${safe}.json`);
}
ipcMain.handle("storage:get", (_event, key) => {
	const file = storagePath(key);
	if (!fs.existsSync(file)) return null;
	try {
		return fs.readFileSync(file, "utf-8");
	} catch {
		return null;
	}
});
ipcMain.handle("storage:set", (_event, key, value) => {
	try {
		fs.writeFileSync(storagePath(key), value, "utf-8");
		return true;
	} catch {
		return false;
	}
});
ipcMain.handle("storage:remove", (_event, key) => {
	const file = storagePath(key);
	if (fs.existsSync(file)) fs.unlinkSync(file);
	return true;
});
ipcMain.handle("storage:getDataPath", () => DATA_DIR);
app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
	app.quit();
});
app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
//#endregion
