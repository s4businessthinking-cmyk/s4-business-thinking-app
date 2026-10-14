const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("S4Desktop", {
  dialog: {
    alert: (message) => ipcRenderer.sendSync("s4-dialog:show", "alert", String(message ?? "")),
    confirm: (message) => ipcRenderer.sendSync("s4-dialog:show", "confirm", String(message ?? "")) === true,
    choose: (message, buttons, cancelId) => ipcRenderer.sendSync("s4-dialog:choose", String(message ?? ""), buttons, cancelId),
  },
  backup: {
    getFolder: () => ipcRenderer.invoke("s4-backup:get-folder"),
    chooseFolder: () => ipcRenderer.invoke("s4-backup:choose-folder"),
    save: (fileName, bytes) => ipcRenderer.invoke("s4-backup:save", fileName, bytes),
    openFolder: () => ipcRenderer.invoke("s4-backup:open-folder"),
  },
  app: {
    // The window close button asks the page first; reply with ackClose(), then closeNow() or cancelClose().
    onCloseRequested: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("s4-app:close-requested", handler);
      return () => ipcRenderer.removeListener("s4-app:close-requested", handler);
    },
    ackClose: () => ipcRenderer.send("s4-app:close-ack"),
    cancelClose: () => ipcRenderer.send("s4-app:close-cancel"),
    closeNow: () => ipcRenderer.send("s4-app:close-now"),
  },
  printing: {
    listPrinters: () => ipcRenderer.invoke("s4-print:list"),
    printHtml: (html, options) => ipcRenderer.invoke("s4-print:html", html, options),
  },
});
