const { app, BrowserWindow, Tray, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const http = require('http');

// Start the backend telemetry server directly in the same process
require('./server.js');

let mainWindow = null;
let tray = null;
let isQuitting = false;

const PORT = process.env.PORT || 3000;
const APP_URL = `http://localhost:${PORT}`;

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#080c14',
    title: 'Hermes LLM 实时 Token 监控大屏',
    icon: path.join(__dirname, 'app.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Wait for local server to be ready, then load
  function loadAppWithRetry(retries = 10) {
    http.get(APP_URL, (res) => {
      mainWindow.loadURL(APP_URL);
    }).on('error', () => {
      if (retries > 0) {
        setTimeout(() => loadAppWithRetry(retries - 1), 300);
      } else {
        mainWindow.loadURL(APP_URL);
      }
    });
  }

  loadAppWithRetry();

  // Intercept close: minimize to tray instead of quitting
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (tray) {
        tray.displayBalloon({
          title: 'Hermes 监控服务运行中',
          content: '应用已最小化到系统托盘，Token 监控在后台持续进行中。'
        });
      }
    }
  });

  // Open external links in user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'app.ico');
  try {
    tray = new Tray(iconPath);
  } catch (e) {
    console.warn('Could not load tray icon:', e.message);
    return;
  }

  tray.setToolTip('Hermes LLM Token 实时监控');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Hermes Token 监控中心',
      enabled: false
    },
    { type: 'separator' },
    {
      label: '🖥️ 显示主窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: '🌐 在外部浏览器中打开',
      click: () => {
        shell.openExternal(APP_URL);
      }
    },
    {
      label: '🔄 刷新大屏页面',
      click: () => {
        if (mainWindow) mainWindow.reload();
      }
    },
    { type: 'separator' },
    {
      label: '❌ 彻底退出应用',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit();
  }
});
