import { app, BrowserWindow, dialog, ipcMain, shell, Notification } from "electron";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".bmp", ".webp"]);
const TASK_DAILY = "配料表日期生成器-每日自动生成";
const TASK_LOGON = "配料表日期生成器-开机补生成";
const templateAnalysisCache = new Map();

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
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error("[date-generator] preload failed", preloadPath, error);
    dialog.showErrorBox(
      "配料表日期生成器启动失败",
      `桌面桥接加载失败：\n${error?.message || String(error)}\n\n请关闭窗口后重新运行 npm run dev。`,
    );
  });

  win.webContents.on("did-fail-load", (_event, code, description, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    console.error("[date-generator] renderer failed to load", { code, description, validatedURL });
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("[date-generator] renderer process exited", details);
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(ROOT, "dist", "index.html"));
  }
}

async function scanTemplates(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && IMAGE_EXTS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => ({ name: entry.name, path: path.join(dir, entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }));
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

function userDataFile(name) {
  return path.join(app.getPath("userData"), name);
}

async function readJson(name, fallback) {
  try {
    return JSON.parse(await fs.readFile(userDataFile(name), "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(name, value) {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(userDataFile(name), JSON.stringify(value, null, 2), "utf8");
}

function localDateValue(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysValue(value, days) {
  const current = new Date(`${value}T00:00:00`);
  current.setDate(current.getDate() + days);
  return localDateValue(current);
}

function dateValues(start, end) {
  const result = [];
  let current = start;
  while (current <= end) {
    result.push(current);
    current = addDaysValue(current, 1);
  }
  return result;
}

function outputFolderName(value) {
  const [, month, day] = value.split("-").map(Number);
  return `${month}月${day}日`;
}

async function recordHistory(payload, result, source = "manual") {
  const templates = await scanTemplates(payload.templateDir);
  const requestedNames = Array.isArray(payload.templateNames) ? new Set(payload.templateNames) : null;
  const requestedTemplates = requestedNames
    ? templates.filter((item) => requestedNames.has(item.name))
    : templates;
  const dates = payload.mode === "range"
    ? dateValues(payload.startDate, payload.endDate)
    : [payload.startDate];

  const existing = await readJson("generation-history.json", []);
  const next = [...existing];

  for (const value of dates) {
    const folder = path.join(payload.outputDir, outputFolderName(value));
    let actual = 0;
    try {
      const generated = await scanTemplates(folder);
      actual = requestedNames
        ? generated.filter((item) => requestedNames.has(item.name)).length
        : generated.length;
    } catch {
      actual = 0;
    }
    const expected = requestedTemplates.length;
    const scope = payload.exportScope || (source === "auto" ? "all" : "all");
    const entry = {
      id: `${payload.outputDir}::${value}::${scope}`,

      date: value,
      folder,
      expected,
      actual,
      complete: expected > 0 && actual >= expected,
      source,
      scope,
      updatedAt: new Date().toISOString(),
    };
    const index = next.findIndex((item) => item.id === entry.id);
    if (index >= 0) next.splice(index, 1);
    next.unshift(entry);
  }

  await writeJson("generation-history.json", next.slice(0, 60));
  return { ...result, historyUpdated: true };
}

function execFilePromise(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || stdout || error.message).trim()));
        return;
      }
      resolve(stdout);
    });
  });
}

function automationCommand() {
  if (app.isPackaged) {
    return `"${process.execPath}" --auto-generate`;
  }
  return `"${process.execPath}" "${ROOT}" --auto-generate`;
}

async function taskExists(name) {
  if (process.platform !== "win32") return false;
  try {
    await execFilePromise("schtasks", ["/Query", "/TN", name]);
    return true;
  } catch {
    return false;
  }
}

async function installAutomation(config) {
  if (process.platform !== "win32") {
    throw new Error("每日自动生成目前只支持 Windows。");
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(config.time)) {
    throw new Error("自动运行时间格式应为 HH:MM，例如 06:00。");
  }

  const command = automationCommand();
  await execFilePromise("schtasks", [
    "/Create", "/SC", "DAILY", "/TN", TASK_DAILY, "/TR", command,
    "/ST", config.time, "/RL", "LIMITED", "/F",
  ]);

  // A second ONLOGON task safely catches up after a powered-off scheduled time.
  await execFilePromise("schtasks", [
    "/Create", "/SC", "ONLOGON", "/TN", TASK_LOGON, "/TR", command,
    "/RL", "LIMITED", "/F",
  ]);

  const saved = { ...config, enabled: true, updatedAt: new Date().toISOString() };
  await writeJson("automation.json", saved);
  return saved;
}

async function removeAutomation() {
  if (process.platform === "win32") {
    for (const name of [TASK_DAILY, TASK_LOGON]) {
      try {
        await execFilePromise("schtasks", ["/Delete", "/TN", name, "/F"]);
      } catch {
        // It is fine if a task was already absent.
      }
    }
  }
  const saved = await readJson("automation.json", {});
  const next = { ...saved, enabled: false, updatedAt: new Date().toISOString() };
  await writeJson("automation.json", next);
  return next;
}

async function getAutomation() {
  const saved = await readJson("automation.json", {
    enabled: false,
    time: "06:00",
    horizonDays: 1,
  });
  const dailyExists = await taskExists(TASK_DAILY);
  return {
    ...saved,
    enabled: Boolean(saved.enabled && dailyExists),
  };
}

async function runAutomaticGeneration() {
  const config = await readJson("automation.json", null);
  if (!config?.enabled || !config.templateDir || !config.outputDir) {
    return { skipped: true, reason: "automation-not-configured" };
  }

  const lockPath = userDataFile("automation.lock");
  let lockHandle = null;
  try {
    try {
      lockHandle = await fs.open(lockPath, "wx");
    } catch {
      try {
        const stat = await fs.stat(lockPath);
        if (Date.now() - stat.mtimeMs > 10 * 60 * 1000) {
          await fs.unlink(lockPath);
          lockHandle = await fs.open(lockPath, "wx");
        } else {
          return { skipped: true, reason: "automation-already-running" };
        }
      } catch {
        return { skipped: true, reason: "automation-already-running" };
      }
    }

    const startDate = localDateValue();
  const horizonDays = Math.max(1, Math.min(31, Number(config.horizonDays) || 1));
  const endDate = addDaysValue(startDate, horizonDays - 1);
  const payload = {
    action: "generate",
    templateDir: config.templateDir,
    outputDir: config.outputDir,
    mode: horizonDays > 1 ? "range" : "single",
    startDate,
    endDate,
    xRatio: config.xRatio ?? 14.3,
    yRatio: config.yRatio ?? 49.9,
    fontRatio: config.fontRatio ?? 4.0,
    adaptivePosition: config.adaptivePosition ?? true,
    fontFamily: config.fontFamily ?? "simhei",
    bold: config.bold ?? false,
    letterSpacing: config.letterSpacing ?? -7,
    skipExisting: true,
  };

    let finalResult = null;
    await runBackend(payload, (message) => {
      if (message.type === "done") finalResult = message;
    });
    if (!finalResult) throw new Error("自动生成没有返回完成结果。");

    await recordHistory(payload, finalResult, "auto");
    return finalResult;
  } finally {
    try {
      await lockHandle?.close();
    } catch {
      // Ignore lock close failures.
    }
    try {
      await fs.unlink(lockPath);
    } catch {
      // Ignore missing lock files.
    }
  }
}

function notify(title, body) {
  if (!Notification.isSupported()) return;
  new Notification({ title, body }).show();
}

function registerIpc() {
  ipcMain.handle("templates:scan", async (_event, dir) => {
    if (!dir || typeof dir !== "string") return null;
    try {
      const templates = await scanTemplates(dir);
      return {
        dir,
        templates,
        suggestedOutput: path.join(path.dirname(dir), "日期生成结果"),
      };
    } catch {
      return null;
    }
  });

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

    templateAnalysisCache.clear();
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

  ipcMain.handle("templates:render-preview", async (_event, payload) => {
    let rendered = null;
    await runBackend({ action: "renderPreview", ...payload }, (message) => {
      if (message.type === "preview-rendered") rendered = message.data;
    });
    if (!rendered) throw new Error("真实预览没有返回渲染结果。");
    return rendered;
  });

  ipcMain.handle("templates:analyze", async (_event, filePath) => {
    const cached = templateAnalysisCache.get(filePath);
    if (cached) return cached;

    let analysis = null;
    await runBackend(
      { action: "analyzeTemplate", path: filePath },
      (message) => {
        if (message.type === "analysis") analysis = message;
      },
    );
    if (!analysis) throw new Error("模板自适应分析没有返回结果。");
    templateAnalysisCache.set(filePath, analysis);
    return analysis;
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
    return recordHistory(payload, finalResult, "manual");
  });

  ipcMain.handle("history:list", async () => readJson("generation-history.json", []));
  ipcMain.handle("history:clear", async () => {
    await writeJson("generation-history.json", []);
    return true;
  });

  ipcMain.handle("automation:get", async () => getAutomation());
  ipcMain.handle("automation:install", async (_event, config) => installAutomation(config));
  ipcMain.handle("automation:remove", async () => removeAutomation());

  ipcMain.handle("folder:open", async (_event, folderPath) => {
    const error = await shell.openPath(folderPath);
    if (error) throw new Error(error);
    return true;
  });
}

app.whenReady().then(async () => {
  if (process.argv.includes("--auto-generate")) {
    try {
      const result = await runAutomaticGeneration();
      if (!result?.skipped) {
        notify("配料表自动生成完成", `已处理 ${result.total ?? result.done ?? 0} 张图片。`);
      }
    } catch (error) {
      console.error("[date-generator] automatic generation failed", error);
      notify("配料表自动生成失败", error?.message || String(error));
      process.exitCode = 1;
    } finally {
      setTimeout(() => app.quit(), 800);
    }
    return;
  }

  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
