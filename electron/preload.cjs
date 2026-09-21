const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dateApp", {
  chooseTemplates: () => ipcRenderer.invoke("templates:choose"),
  prepareTemplates: () => ipcRenderer.invoke("templates:prepare"),
  chooseOutput: () => ipcRenderer.invoke("output:choose"),
  previewTemplate: (filePath) => ipcRenderer.invoke("templates:preview", filePath),
  runGeneration: (payload) => ipcRenderer.invoke("generation:run", payload),
  openFolder: (folderPath) => ipcRenderer.invoke("folder:open", folderPath),
  onGenerationProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("generation:progress", listener);
    return () => ipcRenderer.removeListener("generation:progress", listener);
  },
});
