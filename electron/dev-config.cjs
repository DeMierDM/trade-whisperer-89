// Development configuration for Electron hot reload
const path = require('path');

const isDockerMode = process.env.ELECTRON_DOCKER_MODE === 'true';

module.exports = {
  // Directories to watch for changes
  watchPaths: [
    path.join(__dirname, '..', 'src'),
    path.join(__dirname, '..', 'electron'),
    path.join(__dirname, '..', 'public')
  ],
  
  // Files to ignore during watching
  ignoredPaths: [
    /node_modules/,
    /\.git/,
    /build/,
    /release/,
    /\.DS_Store/,
    /Thumbs\.db/,
    /\.vscode/,
    /\.idea/,
    // Don't ignore dist in Docker mode since we need to watch for build changes
    ...(isDockerMode ? [] : [/dist/])
  ],
  
  // Hot reload options
  reloadOptions: {
    electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit',
    awaitOnMainProcessUpdate: true
  },
  
  // Development logging
  enableLogging: process.env.ELECTRON_ENABLE_LOGGING === 'true'
};