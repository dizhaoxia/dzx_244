import { app, BrowserWindow, ipcMain, Notification, net, shell, dialog } from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import fs from 'fs'
import path from 'path'

let store = null

function initStore() {
  store = new Store({
    name: 'video-downloader-data',
    defaults: {
      history: [],
      settings: {
        downloadDir: '',
        theme: 'light',
        concurrency: 3
      }
    }
  })
}

let mainWindow = null

app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-setuid-sandbox')

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    title: '抖音/快手无水印下载器',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })

  const isDev = !app.isPackaged
  if (isDev) {
    const port = 5173
    mainWindow.loadURL(`http://localhost:${port}`)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    const rendererPath = join(__dirname, '../renderer/index.html')
    mainWindow.loadFile(rendererPath)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  initStore()
  setupIpc()
  createWindow()
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function setupIpc() {
ipcMain.handle('history:get', async () => {
  return store.get('history', [])
})

ipcMain.handle('history:add', async (_e, item) => {
  const history = store.get('history', [])
  history.unshift({ ...item, id: Date.now().toString(), timestamp: Date.now() })
  store.set('history', history)
  return history
})

ipcMain.handle('history:delete', async (_e, id) => {
  const history = store.get('history', [])
  const filtered = history.filter((h) => h.id !== id)
  store.set('history', filtered)
  return filtered
})

ipcMain.handle('history:clear', async () => {
  store.set('history', [])
  return []
})

ipcMain.handle('history:filterByDate', async (_e, startDate, endDate) => {
  const history = store.get('history', [])
  return history.filter((h) => {
    const ts = h.timestamp
    return ts >= startDate && ts <= endDate
  })
})

ipcMain.handle('settings:get', async () => {
  return store.get('settings')
})

ipcMain.handle('settings:set', async (_e, settings) => {
  const current = store.get('settings')
  store.set('settings', { ...current, ...settings })
  return store.get('settings')
})

ipcMain.handle('system:selectDownloadDir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  if (!result.canceled && result.filePaths.length > 0) {
    const dir = result.filePaths[0]
    const settings = store.get('settings')
    store.set('settings', { ...settings, downloadDir: dir })
    return dir
  }
  return null
})

ipcMain.handle('system:getDownloadDir', async () => {
  const settings = store.get('settings')
  return settings.downloadDir || app.getPath('downloads')
})

ipcMain.handle('system:openPath', async (_e, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath)
      return true
    }
    return false
  } catch (e) {
    return false
  }
})

function sendProgress(taskId, progress, speed = 0) {
  if (mainWindow) {
    mainWindow.webContents.send('download:progress', { taskId, progress, speed })
  }
}

function sendComplete(taskId, filePath, success, errorMsg = '') {
  if (mainWindow) {
    mainWindow.webContents.send('download:complete', { taskId, filePath, success, errorMsg })
  }
}

function sanitizeFilename(name) {
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 100)
}

ipcMain.handle(
  'download:start',
  async (_e, { taskId, url, title, referer }) => {
    return new Promise(async (resolve) => {
      try {
        const settings = store.get('settings')
        const downloadDir = settings.downloadDir || app.getPath('downloads')
        if (!fs.existsSync(downloadDir)) {
          fs.mkdirSync(downloadDir, { recursive: true })
        }

        const safeTitle = sanitizeFilename(title || `video_${Date.now()}`)
        const fileName = `${safeTitle}_${Date.now()}.mp4`
        const filePath = path.join(downloadDir, fileName)

        const requestOpts = {
          url,
          method: 'GET',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            ...(referer ? { Referer: referer } : {})
          }
        }

        const request = net.request(requestOpts)
        let totalBytes = 0
        let receivedBytes = 0
        let startTime = Date.now()
        let lastSendTime = 0

        request.on('response', (response) => {
          const statusCode = response.statusCode

          if (statusCode >= 400) {
            sendComplete(taskId, '', false, `HTTP ${statusCode}`)
            resolve({ success: false, error: `HTTP ${statusCode}` })
            return
          }

          totalBytes = parseInt(response.headers['content-length'] || '0', 10)

          const fileStream = fs.createWriteStream(filePath)
          response.on('data', (chunk) => {
            receivedBytes += chunk.length
            fileStream.write(chunk)

            const now = Date.now()
            if (now - lastSendTime > 200) {
              lastSendTime = now
              const progress = totalBytes > 0 ? (receivedBytes / totalBytes) * 100 : 0
              const elapsed = (now - startTime) / 1000
              const speed = elapsed > 0 ? receivedBytes / elapsed : 0
              sendProgress(taskId, progress, speed)
            }
          })

          response.on('end', () => {
            fileStream.end(() => {
              sendProgress(taskId, 100, 0)
              sendComplete(taskId, filePath, true)

              try {
                new Notification({
                  title: '下载完成',
                  body: `${title || '视频'} 已保存到下载目录`,
                  silent: false
                }).show()
              } catch (_) {}

              resolve({ success: true, filePath })
            })
          })

          response.on('error', (err) => {
            fileStream.end()
            try {
              fs.unlinkSync(filePath)
            } catch (_) {}
            sendComplete(taskId, '', false, err.message)
            resolve({ success: false, error: err.message })
          })
        })

        request.on('error', (err) => {
          sendComplete(taskId, '', false, err.message)
          resolve({ success: false, error: err.message })
        })

        request.end()
      } catch (e) {
        sendComplete(taskId, '', false, e.message)
        resolve({ success: false, error: e.message })
      }
    })
  }
)
}
