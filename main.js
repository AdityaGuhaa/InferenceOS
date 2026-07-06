const { app, BrowserWindow, ipcMain, safeStorage } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

let mainWindow
let backendProcess

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    titleBarStyle: 'hiddenInset', // macOS native feel
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.loadFile('index.html')
}

app.whenReady().then(() => {
  createWindow()

  // Start C++ backend
  const backendPath = path.join(__dirname, 'backend', 'build', 'InferenceEngine')
  backendProcess = spawn(backendPath)
  
  backendProcess.stdout.on('data', (data) => {
    console.log(`[C++] ${data}`)
  })
  
  backendProcess.stderr.on('data', (data) => {
    console.error(`[C++] ${data}`)
  })

  backendProcess.on('error', (err) => {
    console.error(`[C++] Process Error:`, err)
  })
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Secure Storage helpers
function getKeysPath() {
  return path.join(app.getPath('userData'), 'keys.json')
}

function loadKeys() {
  try {
    const data = fs.readFileSync(getKeysPath(), 'utf8')
    return JSON.parse(data)
  } catch (e) {
    return {}
  }
}

function saveKeys(keys) {
  fs.writeFileSync(getKeysPath(), JSON.stringify(keys))
}

// IPC Handlers
ipcMain.handle('save-key', async (event, provider, key) => {
  if (!safeStorage.isEncryptionAvailable()) {
    console.error("Encryption not available!")
    return false
  }
  const encrypted = safeStorage.encryptString(key)
  const keys = loadKeys()
  // Store as hex string to save in JSON
  keys[provider] = encrypted.toString('hex')
  saveKeys(keys)
  console.log(`Saved key for ${provider}`)
  return true
})

function getDecryptedKey(provider) {
  if (!safeStorage.isEncryptionAvailable()) return null
  const keys = loadKeys()
  if (!keys[provider]) return null
  
  try {
    const encrypted = Buffer.from(keys[provider], 'hex')
    return safeStorage.decryptString(encrypted)
  } catch(e) {
    console.error("Failed to decrypt key for", provider)
    return null
  }
}

ipcMain.handle('get-key', async (event, provider) => {
  return getDecryptedKey(provider)
})

ipcMain.handle('get-saved-providers', async () => {
  return Object.keys(loadKeys())
})

function getChatHistoryPath() {
  return path.join(app.getPath('userData'), 'chat_history.json')
}

function loadChatHistory() {
  const p = getChatHistoryPath()
  if (fs.existsSync(p)) {
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'))
      if (Array.isArray(data) && (data.length === 0 || !data[0].id)) {
        // Legacy migration
        if (data.length > 0) {
           return [{ id: 'thread-' + Date.now(), title: 'Legacy Chat', messages: data }]
        }
        return []
      }
      return data
    } catch(e) {}
  }
  return []
}

function saveChatHistory() {
  try {
    fs.writeFileSync(getChatHistoryPath(), JSON.stringify(globalChatHistory, null, 2))
  } catch(e) {}
}

let globalChatHistory = loadChatHistory()

ipcMain.handle('get-chat-history', () => {
  return globalChatHistory
})

ipcMain.handle('create-thread', async (event, title) => {
  const newThread = {
    id: 'thread-' + Date.now() + Math.floor(Math.random()*1000),
    title: title || 'New Chat',
    messages: []
  }
  globalChatHistory.unshift(newThread)
  saveChatHistory()
  return newThread
})

ipcMain.handle('delete-thread', async (event, threadId) => {
  globalChatHistory = globalChatHistory.filter(t => t.id !== threadId)
  saveChatHistory()
  return true
})

ipcMain.handle('send-chat', async (event, message, modelType, specificModel, threadId) => {
  console.log(`Sending to ${modelType} (Model: ${specificModel}): ${message}`)
  
  let thread = globalChatHistory.find(t => t.id === threadId)
  if (!thread) {
    thread = { id: threadId || 'thread-' + Date.now(), title: 'New Chat', messages: [] }
    globalChatHistory.unshift(thread)
  }
  
  thread.messages.push({ role: 'user', content: message })
  const contextMessages = thread.messages
  
  if (modelType.includes('Local')) {
    if (backendProcess) {
      backendProcess.stdin.write(message + "\\n")
      return `[Local C++ Engine] Processed: ${message}`
    } else {
      return `Error: C++ Engine not running`
    }
  } else {
    // Cloud request
    const provider = modelType.toLowerCase().split(' ')[0]
    const apiKey = getDecryptedKey(provider)
    
    if (!apiKey) {
      return `Error: No API key found for ${provider}`
    }

    try {
      if (provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: specificModel || 'gpt-3.5-turbo', messages: contextMessages })
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error.message)
        const reply = data.choices[0].message.content
        thread.messages.push({ role: 'assistant', content: reply })
        saveChatHistory()
        return reply
      }
      else if (provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: specificModel || 'claude-3-haiku-20240307', max_tokens: 1024, messages: contextMessages })
        })
        const data = await res.json()
        if (data.type === 'error') throw new Error(data.error.message)
        const reply = data.content[0].text
        thread.messages.push({ role: 'assistant', content: reply })
        saveChatHistory()
        return reply
      }
      else if (provider === 'gemini') {
        const geminiHistory = []
        for (const msg of contextMessages) {
          const role = msg.role === 'assistant' ? 'model' : 'user'
          if (geminiHistory.length > 0 && geminiHistory[geminiHistory.length - 1].role === role) {
            geminiHistory[geminiHistory.length - 1].parts[0].text += '\n\n' + msg.content
          } else {
            geminiHistory.push({ role, parts: [{ text: msg.content }] })
          }
        }
        const model = specificModel || 'gemini-3.5-flash';
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: geminiHistory })
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error.message)
        const reply = data.candidates[0].content.parts[0].text
        thread.messages.push({ role: 'assistant', content: reply })
        saveChatHistory()
        return reply
      }
      else if (provider === 'groq') {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: specificModel || 'llama3-8b-8192', messages: contextMessages })
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error.message)
        const reply = data.choices[0].message.content
        thread.messages.push({ role: 'assistant', content: reply })
        saveChatHistory()
        return reply
      }
      throw new Error(`Unknown provider ${provider}`)
    } catch (e) {
      const errorMsg = `Error: ${e.message}`
      thread.messages.push({ role: 'assistant', content: errorMsg })
      saveChatHistory()
      return errorMsg
    }
  }
})
