const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dateApp", {
  scanTemplates: (dir) => ipcRenderer.invoke("templates:scan", dir),
  chooseTemplates: () => ipcRenderer.invoke("templates:choose"),
  prepareTemplates: () => ipcRenderer.invoke("templates:prepare"),
  chooseOutput: () => ipcRenderer.invoke("output:choose"),
  validateDirectory: (folderPath) => ipcRenderer.invoke("path:validate-directory", folderPath),
  previewTemplate: (filePath) => ipcRenderer.invoke("templates:preview", filePath),
  renderPreview: (payload) => ipcRenderer.invoke("templates:render-preview", payload),
  analyzeTemplate: (filePath) => ipcRenderer.invoke("templates:analyze", filePath),
  runGeneration: (payload) => ipcRenderer.invoke("generation:run", payload),
  listHistory: () => ipcRenderer.invoke("history:list"),
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  getAutomation: () => ipcRenderer.invoke("automation:get"),
  installAutomation: (config) => ipcRenderer.invoke("automation:install", config),
  removeAutomation: () => ipcRenderer.invoke("automation:remove"),
  openFolder: (folderPath) => ipcRenderer.invoke("folder:open", folderPath),
  onGenerationProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("generation:progress", listener);
    return () => ipcRenderer.removeListener("generation:progress", listener);
  },
});
