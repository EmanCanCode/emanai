const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

let mainWindow;
let serverProcess;
let serverPort;

// Find an available random port
function findAvailablePort() {
  return new Promise((resolve, reject) => {
    // Try random port between 49152-65535 (dynamic/private ports)
    const port = Math.floor(Math.random() * (65535 - 49152 + 1)) + 49152;

    const server = net.createServer();

    server.listen(port, () => {
      server.once('close', () => {
        resolve(port);
      });
      server.close();
    });

    server.on('error', () => {
      // Port in use, try again
      resolve(findAvailablePort());
    });
  });
}

// Start the Node.js server
async function startServer() {
  serverPort = await findAvailablePort();

  console.log(`[ELECTRON] Starting EmanAI server on port ${serverPort}...`);

  // Set environment variable for the port
  const env = { ...process.env, PORT: serverPort.toString() };

  // Use 'node' to run the ES module
  serverProcess = spawn('node', ['app.js'], {
    cwd: app.isPackaged ? process.resourcesPath : __dirname,
    env: env,
    stdio: 'inherit',
    shell: true
  });

  serverProcess.on('error', (err) => {
    console.error('[ELECTRON] Failed to start server:', err);
  });

  serverProcess.on('exit', (code) => {
    console.log(`[ELECTRON] Server process exited with code ${code}`);
  });

  // Wait for server to be ready
  await waitForServer(serverPort);
  console.log(`[ELECTRON] Server is ready on port ${serverPort}`);
}

// Wait for server to start responding
function waitForServer(port, maxAttempts = 60) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const checkServer = () => {
      const client = net.connect(port, '127.0.0.1', () => {
        client.end();
        resolve();
      });

      client.on('error', () => {
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkServer, 500);
        } else {
          reject(new Error('Server failed to start after 30 seconds'));
        }
      });
    };

    // Start checking after 1 second delay
    setTimeout(checkServer, 1000);
  });
}

// Create the browser window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true
    },
    icon: path.join(__dirname, 'icon.png'),
    title: 'EmanAI',
    backgroundColor: '#0b1220',
    autoHideMenuBar: true
  });

  // Load the app
  mainWindow.loadURL(`http://localhost:${serverPort}`);

  // Uncomment to open DevTools automatically
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
}

// App lifecycle
app.whenReady().then(async () => {
  try {
    console.log('[ELECTRON] App is ready, starting server...');
    await startServer();
    console.log('[ELECTRON] Creating window...');
    createWindow();
  } catch (err) {
    console.error('[ELECTRON] Failed to start EmanAI:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Kill the server process
  if (serverProcess) {
    console.log('[ELECTRON] Killing server process...');
    serverProcess.kill('SIGTERM');

    // Force kill after 5 seconds if it doesn't exit
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    }, 5000);
  }

  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Cleanup on app quit
app.on('before-quit', () => {
  if (serverProcess) {
    console.log('[ELECTRON] App quitting, killing server...');
    try {
      serverProcess.kill('SIGTERM');
    } catch (err) {
      console.error('[ELECTRON] Error killing server:', err);
    }
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('[ELECTRON] Uncaught exception:', err);
});
