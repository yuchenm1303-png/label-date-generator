import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("dateApp", {
  chooseTemplates: () => ipcRenderer.invoke("templates:choose"),
  chooseOutput: () => ipcRenderer.invoke("output:choose"),
  previewTemplate: (path) => ipcRenderer.invoke("templates:preview", path),
  runGeneration: (payload) => ipcRenderer.invoke("generation:run", payload),
  openFolder: (path) => ipcRenderer.invoke("folder:open", path),
  onGenerationProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("generation:progress", listener);
    return () => ipcRenderer.removeListener("generation:progress", listener);
  },
});
