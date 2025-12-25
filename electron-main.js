const { app, BrowserWindow } = require("electron");
const path = require("path");

let serverHandle = null;

function createWindow(port, host) {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const url = `http://${host}:${port}/`;
  win.loadURL(url);
}

async function start() {
  // Start the embedded server
  const srv = require("./server.cjs");
  const info = await srv.startServer();
  serverHandle = info.server;

  createWindow(info.port, info.host);
}

app.on("ready", () => {
  start().catch((err) => {
    console.error("Failed to start server:", err);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  try {
    if (serverHandle) serverHandle.close();
  } catch {}
});
// Keep a single embedded-server approach. The main logic above
// starts `server.cjs` in-process and opens a BrowserWindow.

// Handle uncaught exceptions for stability
process.on("uncaughtException", (err) => {
  console.error("[ELECTRON] Uncaught exception:", err);
});
