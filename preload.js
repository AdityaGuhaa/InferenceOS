const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  saveKey: (provider, key) => ipcRenderer.invoke('save-key', provider, key),
  sendChat: (message, provider, specificModel, threadId) => ipcRenderer.invoke('send-chat', message, provider, specificModel, threadId),
  getSavedProviders: () => ipcRenderer.invoke('get-saved-providers'),
  getChatHistory: () => ipcRenderer.invoke('get-chat-history'),
  createThread: (title) => ipcRenderer.invoke('create-thread', title),
  deleteThread: (id) => ipcRenderer.invoke('delete-thread', id)
})
