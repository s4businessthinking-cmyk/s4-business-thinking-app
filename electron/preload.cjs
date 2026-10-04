const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("S4Desktop", {
  backup: {
    getFolder: () => ipcRenderer.invoke("s4-backup:get-folder"),
    chooseFolder: () => ipcRenderer.invoke("s4-backup:choose-folder"),
    save: (fileName, bytes) => ipcRenderer.invoke("s4-backup:save", fileName, bytes),
    openFolder: () => ipcRenderer.invoke("s4-backup:open-folder"),
  },
  printing: {
    listPrinters: () => ipcRenderer.invoke("s4-print:list"),
    printHtml: (html, options) => ipcRenderer.invoke("s4-print:html", html, options),
  },
});
