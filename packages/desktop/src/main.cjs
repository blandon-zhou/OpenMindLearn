const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const net = require('net')
const fs = require('fs')

const isDev = process.env.OML_DESKTOP_DEV === '1'
const useExternalBackend = process.env.OML_EXTERNAL_BACKEND === '1'
const frontendDevUrl = process.env.OML_DESKTOP_FRONTEND_URL || 'http://localhost:5173'
const preferredBackendPort = Number(process.env.OML_BACKEND_PORT || 15174)

let backendProcess = null
let backendPort = preferredBackendPort
let appIsQuitting = false

function ensureOmlExtension(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) return ''
  return filePath.toLowerCase().endsWith('.oml') ? filePath : `${filePath}.oml`
}

function getSecretStoreFilePath() {
  return path.join(app.getPath('userData'), 'secure-secrets.json')
}

async function readSecretStore() {
  const filePath = getSecretStoreFilePath()
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    return {}
  }
}

async function writeSecretStore(store) {
  const filePath = getSecretStoreFilePath()
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  await fs.promises.writeFile(filePath, JSON.stringify(store, null, 2), { mode: 0o600 })
}

function assertEncryptionAvailable() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption is unavailable')
  }
}

function encryptSecret(plaintext) {
  assertEncryptionAvailable()
  return safeStorage.encryptString(plaintext).toString('base64')
}

function decryptSecret(ciphertext) {
  assertEncryptionAvailable()
  const buffer = Buffer.from(ciphertext, 'base64')
  return safeStorage.decryptString(buffer)
}

function registerSecretIpcHandlers() {
  ipcMain.handle('oml:secret:get', async (_event, secretId) => {
    if (typeof secretId !== 'string' || !secretId.trim()) {
      throw new Error('Invalid secret id')
    }

    const store = await readSecretStore()
    const record = store[secretId]
    if (!record || typeof record.ciphertext !== 'string' || !record.ciphertext) {
      return null
    }

    try {
      return decryptSecret(record.ciphertext)
    } catch {
      return null
    }
  })

  ipcMain.handle('oml:secret:set', async (_event, secretId, plaintext) => {
    if (typeof secretId !== 'string' || !secretId.trim()) {
      throw new Error('Invalid secret id')
    }
    if (typeof plaintext !== 'string' || !plaintext.trim()) {
      throw new Error('Invalid secret value')
    }

    const store = await readSecretStore()
    store[secretId] = {
      ciphertext: encryptSecret(plaintext.trim()),
      updatedAt: new Date().toISOString()
    }
    await writeSecretStore(store)
  })

  ipcMain.handle('oml:secret:remove', async (_event, secretId) => {
    if (typeof secretId !== 'string' || !secretId.trim()) {
      throw new Error('Invalid secret id')
    }

    const store = await readSecretStore()
    if (store[secretId]) {
      delete store[secretId]
      await writeSecretStore(store)
    }
  })
}

function registerFileIpcHandlers() {
  ipcMain.handle('oml:pick-open-path', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open OpenMindLearn File',
      properties: ['openFile'],
      filters: [{ name: 'OpenMindLearn', extensions: ['oml'] }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle('oml:pick-save-path', async (_event, suggestedName) => {
    const safeName = typeof suggestedName === 'string' && suggestedName.trim() ? suggestedName.trim() : 'Untitled'
    const fileName = ensureOmlExtension(safeName)
    const result = await dialog.showSaveDialog({
      title: 'Save OpenMindLearn File',
      defaultPath: path.join(app.getPath('documents'), fileName),
      filters: [{ name: 'OpenMindLearn', extensions: ['oml'] }]
    })

    if (result.canceled || !result.filePath) {
      return null
    }

    return ensureOmlExtension(result.filePath)
  })

  ipcMain.handle('oml:read-base64', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !filePath.trim()) {
      throw new Error('Invalid file path')
    }
    const buffer = await fs.promises.readFile(filePath)
    return buffer.toString('base64')
  })

  ipcMain.handle('oml:write-base64', async (_event, filePath, base64Data) => {
    if (typeof filePath !== 'string' || !filePath.trim()) {
      throw new Error('Invalid file path')
    }
    if (typeof base64Data !== 'string' || !base64Data.trim()) {
      throw new Error('Invalid file data')
    }

    const normalizedPath = ensureOmlExtension(filePath)
    const buffer = Buffer.from(base64Data, 'base64')
    await fs.promises.writeFile(normalizedPath, buffer)
    return true
  })
}

function resolveBackendEntry() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend', 'dist', 'index.js')
  }
  return path.resolve(__dirname, '../../backend/dist/index.js')
}

function resolveBackendCwd() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend')
  }
  return path.resolve(__dirname, '../../backend')
}

function resolveFrontendEntry() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'frontend', 'dist', 'index.html')
  }
  return path.resolve(__dirname, '../../frontend/dist/index.html')
}

function canBindPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

async function findAvailablePort(startPort) {
  for (let offset = 0; offset < 20; offset += 1) {
    const candidate = startPort + offset
    // eslint-disable-next-line no-await-in-loop
    const available = await canBindPort(candidate)
    if (available) {
      return candidate
    }
  }
  throw new Error(`Unable to find available port near ${startPort}`)
}

function waitForPortReady(port, timeoutMs = 15000) {
  const start = Date.now()

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port })
      socket.once('connect', () => {
        socket.end()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Backend did not start within ${timeoutMs}ms`))
          return
        }
        setTimeout(attempt, 200)
      })
    }

    attempt()
  })
}

async function startBackendIfNeeded() {
  if (useExternalBackend) {
    return
  }

  backendPort = await findAvailablePort(preferredBackendPort)

  backendProcess = spawn(process.execPath, [resolveBackendEntry()], {
    cwd: resolveBackendCwd(),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      OML_DISABLE_DOTENV: '1',
      HOST: '127.0.0.1',
      PORT: String(backendPort)
    },
    stdio: 'inherit'
  })

  backendProcess.once('exit', (code, signal) => {
    backendProcess = null
    if (!appIsQuitting) {
      console.error(`Backend exited unexpectedly (code=${code}, signal=${signal})`)
    }
  })

  await waitForPortReady(backendPort)
}

function stopBackend() {
  if (!backendProcess || backendProcess.killed) {
    return
  }
  backendProcess.kill('SIGTERM')
}

function createMainWindow() {
  const apiBase = `http://127.0.0.1:${backendPort}/api`
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    title: 'OpenMindLearn',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--oml-api-base=${apiBase}`]
    }
  })

  if (isDev) {
    mainWindow.loadURL(frontendDevUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
    return
  }

  mainWindow.loadFile(resolveFrontendEntry())
}

app.whenReady().then(async () => {
  try {
    registerFileIpcHandlers()
    registerSecretIpcHandlers()
    await startBackendIfNeeded()
    createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow()
      }
    })
  } catch (error) {
    console.error(error)
    app.quit()
  }
})

app.on('before-quit', () => {
  appIsQuitting = true
  stopBackend()
})

app.on('window-all-closed', () => {
  stopBackend()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
