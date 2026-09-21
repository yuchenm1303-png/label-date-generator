import { app, BrowserWindow, dialog, ipcMain, shell, Notification, nativeImage } from "electron";
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


function dominantAlphaSquare(image, alphaThreshold = 12, safeMargin = 0.07) {
  if (!image || image.isEmpty()) return image;

  const { width, height } = image.getSize();
  const bitmap = image.toBitmap();
  const pixelCount = width * height;
  if (!width || !height || bitmap.length < pixelCount * 4) return image;

  const visited = new Uint8Array(pixelCount);
  let best = null;
  const stack = [];

  const isOpaque = (index) => bitmap[index * 4 + 3] > alphaThreshold;

  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start] || !isOpaque(start)) continue;

    visited[start] = 1;
    stack.length = 0;
    stack.push(start);

    let count = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    while (stack.length) {
      const index = stack.pop();
      const x = index % width;
      const y = Math.floor(index / width);

      count += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const next = ny * width + nx;
          if (visited[next] || !isOpaque(next)) continue;
          visited[next] = 1;
          stack.push(next);
        }
      }
    }

    if (!best || count > best.count) {
      best = { count, minX, minY, maxX, maxY };
    }
  }

  if (!best || best.count < 8) return image;

  const contentWidth = best.maxX - best.minX + 1;
  const contentHeight = best.maxY - best.minY + 1;
  const maxContent = Math.max(contentWidth, contentHeight);
  const side = Math.min(
    width,
    height,
    Math.max(1, Math.ceil(maxContent * (1 + safeMargin * 2))),
  );

  const centerX = (best.minX + best.maxX + 1) / 2;
  const centerY = (best.minY + best.maxY + 1) / 2;
  const x = Math.max(0, Math.min(width - side, Math.round(centerX - side / 2)));
  const y = Math.max(0, Math.min(height - side, Math.round(centerY - side / 2)));

  return image.crop({ x, y, width: side, height: side });
}

function appIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "feather-quill.png")
    : path.join(ROOT, "build", "icon.png");
}

function createWindowIcon() {
  const source = nativeImage.createFromPath(appIconPath());
  return dominantAlphaSquare(source);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 700,
    backgroundColor: "#f6f7fb",
    title: "配料表日期生成器",
    icon: createWindowIcon(),
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

function backendScriptPath() {
  return path.join(ROOT, "date_backend.py");
}

function backendCandidates() {
  if (app.isPackaged) {
    return [[path.join(process.resourcesPath, "date-backend.exe"), []]];
  }

  const script = backendScriptPath();
  if (process.env.PYTHON) return [[process.env.PYTHON, [script]]];
  if (process.platform === "win32") {
    return [["py", ["-3", script]], ["python", [script]]];
  }
  return [["python3", [script]], ["python", [script]]];
}

function compactBackendError(stderr) {
  const lines = String(stderr || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return "";
  const useful = lines.filter(
    (line) =>
      !line.startsWith("Error processing line") &&
      !line.startsWith("Remainder of file ignored") &&
      !line.includes("site-packages\\sphinxcontrib_"),
  );
  return (useful.length ? useful : lines).slice(-4).join("\n");
}

function runBackendProcess(command, args, payload, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: app.isPackaged ? process.resourcesPath : ROOT,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
      },
    });

    let stdoutBuffer = "";
    let stderr = "";
    let backendError = "";
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
          const message = JSON.parse(line);
          if (message?.type === "error" && message?.message) {
            backendError = String(message.message);
          }
          onLine(message);
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
      if (code === 0) {
        resolve();
        return;
      }

      const fallback = compactBackendError(stderr);
      reject(new Error(backendError || fallback || `图片处理模块退出，代码 ${code}`));
    });

    const json = JSON.stringify(payload);
    const encoded = Buffer.from(json, "utf8").toString("base64");
    child.stdin.end(encoded);
  });
}

async function runBackend(payload, onLine) {
  let lastError = null;
  const candidates = backendCandidates();

  for (const [command, args] of candidates) {
    try {
      await runBackendProcess(command, args, payload, onLine);
      return;
    } catch (error) {
      lastError = error;
      if (error?.code !== "ENOENT") throw error;
    }
  }

  if (app.isPackaged) {
    throw lastError || new Error("安装包中的图片处理模块缺失，请重新安装最新版。");
  }
  throw lastError || new Error("未找到 Python。开发模式请安装 Python 3.10+ 后重试。");
}

function userDataFile(name) {
  return path.join(app.getPath("userData"), name);
}

function hasBrokenUnicodePath(value) {
  return typeof value !== "string" || !value.trim() || value.includes("\uFFFD");
}

async function isExistingDirectory(value) {
  if (hasBrokenUnicodePath(value)) return false;
  try {
    const stat = await fs.stat(value);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function openDirectoryNative(folderPath) {
  const normalized = path.normalize(folderPath);

  // Electron's shell API uses Unicode JS strings and is the preferred path.
  // It also gives us a concrete error string instead of merely confirming
  // that explorer.exe was spawned.
  const shellError = await shell.openPath(normalized);
  if (!shellError) return true;

  if (process.platform === "win32") {
    const explorerPath = path.join(process.env.WINDIR || "C:\\Windows", "explorer.exe");
    try {
      await execFilePromise(explorerPath, [normalized]);
      return true;
    } catch {
      // Fall through to the useful Electron error below.
    }
  }

  throw new Error(shellError || "系统没有成功打开这个文件夹。");
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

  ipcMain.handle("path:validate-directory", async (_event, folderPath) => {
    return isExistingDirectory(folderPath);
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

    // The user-selected path already exists as a native Electron Unicode
    // string. Rebuild the path we expose to the UI from that source instead
    // of depending on a Python stdout round-trip.
    const safeOutputDir = path.normalize(payload.outputDir);
    const safeOpenPath =
      payload.mode === "single"
        ? path.join(safeOutputDir, outputFolderName(payload.startDate))
        : safeOutputDir;
    const safeResult = {
      ...finalResult,
      outputDir: safeOutputDir,
      openPath: safeOpenPath,
    };

    return recordHistory(payload, safeResult, "manual");
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
    if (hasBrokenUnicodePath(folderPath)) {
      throw new Error("保存的路径文本已经损坏，请重新选择一次输出位置。中文用户名和中文文件夹本身是支持的。");
    }
    if (!(await isExistingDirectory(folderPath))) {
      throw new Error("这个文件夹位置不存在或已被移动，请重新选择输出位置。");
    }

    try {
      await openDirectoryNative(folderPath);
      return { ok: true, path: path.normalize(folderPath) };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`无法打开文件夹：${detail}`);
    }
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
