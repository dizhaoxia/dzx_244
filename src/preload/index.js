import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getHistory: () => ipcRenderer.invoke('history:get'),
  addHistory: (item) => ipcRenderer.invoke('history:add', item),
  deleteHistory: (id) => ipcRenderer.invoke('history:delete', id),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  filterHistoryByDate: (start, end) => ipcRenderer.invoke('history:filterByDate', start, end),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),

  selectDownloadDir: () => ipcRenderer.invoke('system:selectDownloadDir'),
  getDownloadDir: () => ipcRenderer.invoke('system:getDownloadDir'),
  openPath: (filePath) => ipcRenderer.invoke('system:openPath', filePath),

  startDownload: (payload) => ipcRenderer.invoke('download:start', payload),

  onDownloadProgress: (callback) => {
    const listener = (_e, data) => callback(data)
    ipcRenderer.on('download:progress', listener)
    return () => ipcRenderer.removeListener('download:progress', listener)
  },

  onDownloadComplete: (callback) => {
    const listener = (_e, data) => callback(data)
    ipcRenderer.on('download:complete', listener)
    return () => ipcRenderer.removeListener('download:complete', listener)
  }
})
