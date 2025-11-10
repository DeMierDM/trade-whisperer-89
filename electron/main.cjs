const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const http = require('http');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development';
const isDockerMode = process.env.ELECTRON_DOCKER_MODE === 'true';

// ============================================
// HOT RELOAD FOR DEVELOPMENT
// ============================================
if (isDev) {
  try {
    const devConfig = require('./dev-config.cjs');
    
    if (isDockerMode) {
      // Custom hot reload for Docker mode
      const chokidar = require('chokidar');
      const { spawn } = require('child_process');
      
      console.log('🔥 Setting up Docker mode hot reload with auto-rebuild');
      console.log('📁 Watching paths:', devConfig.watchPaths);
      
      let isRebuilding = false;
      let rebuildQueued = false;
      
      const watcher = chokidar.watch(devConfig.watchPaths, {
        ignored: devConfig.ignoredPaths,
        persistent: true,
        ignoreInitial: true
      });
      
      // DISABLED: Hot reload rebuild causes blank screens
      // Vite dev server handles hot reload automatically
      console.log('✅ Using Vite dev server - hot reload handled by Vite');
      console.log('⚠️  Manual rebuilds disabled to prevent blank screens');
      
    } else {
      // Standard electron-reload for non-Docker mode
      require('electron-reload')(devConfig.watchPaths, {
        ...devConfig.reloadOptions,
        ignored: devConfig.ignoredPaths
      });

      if (devConfig.enableLogging) {
        console.log('🔥 Electron hot reload enabled with enhanced logging');
        console.log('📁 Watching paths:', devConfig.watchPaths);
      } else {
        console.log('🔥 Electron hot reload enabled');
      }
    }
  } catch (error) {
    console.log('⚠️ Could not enable hot reload:', error.message);
  }
}
let mainWindow;
let splashWindow;
let dockerProcess;

// ============================================
// DOCKER AUTO-START FUNCTIONALITY
// ============================================

/**
 * Check if Docker is installed and running
 */
async function checkDockerInstalled() {
  return new Promise((resolve) => {
    exec('docker --version', (error) => {
      if (error) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * Check if Docker daemon is running
 */
async function checkDockerRunning() {
  return new Promise((resolve) => {
    exec('docker info', (error) => {
      if (error) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * Start Docker Desktop (macOS)
 */
async function startDockerDesktop() {
  return new Promise((resolve, reject) => {
    console.log('🐳 Starting Docker Desktop...');
    exec('open -a Docker', (error) => {
      if (error) {
        reject(error);
      } else {
        // Wait for Docker to be ready
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds

        const checkInterval = setInterval(async () => {
          attempts++;
          const running = await checkDockerRunning();

          if (running) {
            clearInterval(checkInterval);
            console.log('✅ Docker is ready');
            resolve(true);
          } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            reject(new Error('Docker failed to start within 30 seconds'));
          }
        }, 1000);
      }
    });
  });
}

/**
 * Start Docker Compose services
 */
async function startDockerServices() {
  return new Promise((resolve, reject) => {
    console.log('🚀 Starting Docker services...');

    // Get the app's root directory
    const appRoot = isDev
      ? process.cwd()
      : path.join(process.resourcesPath, '..');

    const dockerComposePath = isDockerMode 
      ? path.join(appRoot, 'docker-compose.electron.yml')
      : path.join(appRoot, 'docker-compose.yml');

    // Check if docker-compose.yml exists
    if (!fs.existsSync(dockerComposePath)) {
      console.log('⚠️ No docker-compose file found, skipping Docker services');
      resolve(false);
      return;
    }

    // Start docker-compose
    const composeFile = isDockerMode ? 'docker-compose.electron.yml' : 'docker-compose.yml';
    dockerProcess = spawn('docker-compose', ['-f', composeFile, 'up', '-d'], {
      cwd: appRoot,
      stdio: 'pipe'
    });

    dockerProcess.stdout.on('data', (data) => {
      console.log(`Docker: ${data.toString()}`);
    });

    dockerProcess.stderr.on('data', (data) => {
      console.error(`Docker Error: ${data.toString()}`);
    });

    dockerProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Docker services started');
        resolve(true);
      } else {
        reject(new Error(`Docker compose exited with code ${code}`));
      }
    });

    // Timeout after 60 seconds
    setTimeout(() => {
      if (dockerProcess && !dockerProcess.killed) {
        resolve(true); // Assume success if still running
      }
    }, 60000);
  });
}

/**
 * Check if API server is responding
 */
async function checkApiHealth() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/health',
      method: 'GET',
      timeout: 2000
    };

    const req = http.request(options, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => {
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

/**
 * Wait for API server to be ready
 */
async function waitForApiReady(maxAttempts = 30) {
  console.log('⏳ Waiting for API server to be ready...');

  for (let i = 0; i < maxAttempts; i++) {
    const healthy = await checkApiHealth();

    if (healthy) {
      console.log('✅ API server is ready');
      return true;
    }

    // Wait 1 second before next attempt
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (splashWindow) {
      const progress = Math.floor((i / maxAttempts) * 100);
      splashWindow.webContents.send('startup-progress', {
        message: `Starting services... ${progress}%`,
        progress
      });
    }
  }

  return false;
}

/**
 * Initialize all services before showing main window
 */
async function initializeServices() {
  try {
    updateSplash('Checking Docker installation...');

    // Check if Docker is installed
    const dockerInstalled = await checkDockerInstalled();

    if (!dockerInstalled) {
      console.log('⚠️ Docker not installed, running without backend services');
      const response = await dialog.showMessageBox({
        type: 'warning',
        title: 'Docker Not Found',
        message: 'Docker is not installed. The app will run without backend services.',
        detail: 'Install Docker Desktop to enable trading features.',
        buttons: ['Continue Anyway', 'Install Docker', 'Quit'],
        defaultId: 0
      });

      if (response.response === 1) {
        require('electron').shell.openExternal('https://www.docker.com/products/docker-desktop');
        app.quit();
        return false;
      } else if (response.response === 2) {
        app.quit();
        return false;
      }

      return true; // Continue without Docker
    }

    updateSplash('Checking Docker daemon...');

    // Check if Docker is running
    let dockerRunning = await checkDockerRunning();

    if (!dockerRunning) {
      updateSplash('Starting Docker Desktop...');
      try {
        await startDockerDesktop();
        dockerRunning = true;
      } catch (error) {
        console.error('Failed to start Docker:', error);
        const response = await dialog.showMessageBox({
          type: 'warning',
          title: 'Docker Failed to Start',
          message: 'Could not start Docker automatically.',
          detail: 'Please start Docker Desktop manually and restart the app.',
          buttons: ['Continue Anyway', 'Quit'],
          defaultId: 0
        });

        if (response.response === 1) {
          app.quit();
          return false;
        }

        return true; // Continue without Docker
      }
    }

    updateSplash('Starting backend services...');

    // Start Docker services
    try {
      await startDockerServices();
    } catch (error) {
      console.error('Failed to start Docker services:', error);
    }

    updateSplash('Waiting for API server...');

    // Wait for API to be ready
    const apiReady = await waitForApiReady();

    if (!apiReady) {
      console.log('⚠️ API server not responding, continuing anyway');
    }

    return true;

  } catch (error) {
    console.error('Error initializing services:', error);
    return true; // Continue anyway
  }
}

// ============================================
// SPLASH SCREEN
// ============================================

function createSplashScreen() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Create a simple HTML splash screen
  const splashHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: rgba(15, 23, 42, 0.95);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            border-radius: 12px;
          }
          .container {
            text-align: center;
            padding: 40px;
          }
          h1 {
            font-size: 28px;
            margin-bottom: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          .spinner {
            width: 50px;
            height: 50px;
            margin: 20px auto;
            border: 4px solid rgba(102, 126, 234, 0.3);
            border-top-color: #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          .status {
            font-size: 14px;
            color: #94a3b8;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Trade Whisperer</h1>
          <div class="spinner"></div>
          <div class="status" id="status">Initializing...</div>
        </div>
      </body>
    </html>
  `;

  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHTML));
}

function updateSplash(message) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.executeJavaScript(
      `document.getElementById('status').textContent = '${message}'`
    );
  }
  console.log(`📋 ${message}`);
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

// ============================================
// MAIN WINDOW
// ============================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: 'Trade Whisperer',
    show: false, // Don't show until ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      // Disable cache in development for Docker mode
      ...(isDev && isDockerMode && {
        partition: 'persist:electron-dev',
        cache: false
      })
    },
    backgroundColor: '#0f172a',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 10, y: 10 }
  });

  // Clear cache in development Docker mode
  if (isDev && isDockerMode) {
    mainWindow.webContents.session.clearCache().then(() => {
      console.log('💾 Initial cache cleared for fresh start');
    });
  }

  // Load the app
  if (isDev) {
    // Development mode - ALWAYS use Vite dev server for hot reload
    console.log('🔥 Development mode - connecting to Vite dev server');

    // Wait for Vite to be ready
    const checkVite = async () => {
      for (let i = 0; i < 30; i++) {
        try {
          const response = await require('http').get('http://localhost:8080', () => {});
          response.on('error', () => {});
          console.log('✅ Vite dev server is ready');
          return true;
        } catch (e) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      return false;
    };

    checkVite().then(ready => {
      if (ready) {
        mainWindow.loadURL('http://localhost:8080');
        mainWindow.webContents.openDevTools();
      } else {
        console.error('❌ Vite dev server not ready, falling back to built files');
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
        mainWindow.webContents.openDevTools();
      }
    });
  } else {
    // Production mode
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    closeSplash();
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ============================================
// APP LIFECYCLE
// ============================================

app.whenReady().then(async () => {
  // Show splash screen
  createSplashScreen();

  // Initialize services in background
  await initializeServices();

  // Create main window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Clean up Docker services on quit
  if (dockerProcess && !dockerProcess.killed) {
    console.log('🛑 Stopping Docker services...');
    const appRoot = isDev ? process.cwd() : path.join(process.resourcesPath, '..');
    const composeFile = isDockerMode ? 'docker-compose.electron.yml' : 'docker-compose.yml';
    exec(`docker-compose -f ${composeFile} down`, { cwd: appRoot }, (error) => {
      if (error) {
        console.error('Error stopping Docker:', error);
      }
    });
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Clean up on quit
  if (dockerProcess && !dockerProcess.killed) {
    dockerProcess.kill();
  }
});

// Security: prevent navigation to external sites
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);

    if (isDev && parsedUrl.origin !== 'http://localhost:8080') {
      event.preventDefault();
    }
  });
});
