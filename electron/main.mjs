import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".bmp", ".webp"]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 700,
    backgroundColor: "#f6f7fb",
    title: "配料表日期生成器",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#ffffff",
      symbolColor: "#5a6070",
      height: 46,
    },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(ROOT, "dist", "index.html"));
  }
}

function scanTemplates(dir) {
  return fs.readdir(dir, { withFileTypes: true }).then((entries) =>
    entries
      .filter((entry) => entry.isFile() && IMAGE_EXTS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => ({ name: entry.name, path: path.join(dir, entry.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true })),
  );
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".bmp") return "image/bmp";
  return "image/jpeg";
}

function backendPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "date_backend.py")
    : path.join(ROOT, "date_backend.py");
}

function pythonCandidates() {
  if (process.env.PYTHON) return [[process.env.PYTHON, []]];
  if (process.platform === "win32") return [["py", ["-3"]], ["python", []]];
  return [["python3", []], ["python", []]];
}

function runWithPython(command, args, payload, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args, backendPath()], {
      cwd: app.isPackaged ? process.resourcesPath : ROOT,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutBuffer = "";
    let stderr = "";
    let settled = false;

    child.once("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          onLine(JSON.parse(line));
        } catch {
          // Ignore non-JSON diagnostic output from the backend.
        }
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Python backend exited with code ${code}`));
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

async function runBackend(payload, onLine) {
  let lastError = null;
  for (const [command, args] of pythonCandidates()) {
    try {
      await runWithPython(command, args, payload, onLine);
      return;
    } catch (error) {
      lastError = error;
      if (error?.code !== "ENOENT") throw error;
    }
  }
  throw lastError || new Error("未找到 Python。请安装 Python 3.10+ 后重试。");
}

app.whenReady().then(() => {
  ipcMain.handle("templates:choose", async () => {
    const result = await dialog.showOpenDialog({
      title: "选择配料表模板文件夹",
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;

    const dir = result.filePaths[0];
    const templates = await scanTemplates(dir);
    return {
      dir,
      templates,
      suggestedOutput: path.join(path.dirname(dir), "日期生成结果"),
    };
  });

  ipcMain.handle("templates:prepare", async () => {
    const result = await dialog.showOpenDialog({
      title: "选择一个已有日期的历史成品文件夹（例如 10月1日）",
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;

    const sourceDir = result.filePaths[0];
    const destinationDir = path.join(path.dirname(sourceDir), "无日期模板");
    let prepared = null;

    await runBackend(
      {
        action: "prepareTemplates",
        sourceDir,
        destinationDir,
      },
      (message) => {
        if (message.type === "prepared") prepared = message;
      },
    );

    if (!prepared) throw new Error("模板准备任务没有返回完成结果。");

    const templates = await scanTemplates(destinationDir);
    return {
      dir: destinationDir,
      templates,
      suggestedOutput: path.join(path.dirname(destinationDir), "自动生成结果"),
      count: templates.length,
    };
  });

  ipcMain.handle("output:choose", async () => {
    const result = await dialog.showOpenDialog({
      title: "选择输出位置",
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle("templates:preview", async (_event, filePath) => {
    const data = await fs.readFile(filePath);
    return `data:${mimeFor(filePath)};base64,${data.toString("base64")}`;
  });

  ipcMain.handle("generation:run", async (event, payload) => {
    let finalResult = null;
    await runBackend({ action: "generate", ...payload }, (message) => {
      if (message.type === "progress") {
        event.sender.send("generation:progress", message);
      }
      if (message.type === "done") finalResult = message;
    });
    if (!finalResult) throw new Error("生成任务没有返回完成结果。");
    return finalResult;
  });

  ipcMain.handle("folder:open", async (_event, folderPath) => {
    const error = await shell.openPath(folderPath);
    if (error) throw new Error(error);
    return true;
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
