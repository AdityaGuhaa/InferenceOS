let allThreads = [];
let activeThreadId = null;

const modelsByProvider = {
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
  ],
  anthropic: [
    { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' }
  ],
  gemini: [
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' },
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
    { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash-Lite' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite' }
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B' }
  ],
  local: [
    { id: 'default', name: 'Default Local Model' }
  ]
};

function updateModelDropdown(provider) {
  const select = document.getElementById('specific-model-select');
  select.innerHTML = '';
  document.getElementById('current-provider-name').textContent = provider.charAt(0).toUpperCase() + provider.slice(1);
  
  const models = modelsByProvider[provider] || [];
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    select.appendChild(opt);
  });
}

function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => {
    if (v.id !== viewId) {
      v.classList.remove('active');
      setTimeout(() => v.style.display = 'none', 400); // Wait for transition
    }
  });
  
  const target = document.getElementById(viewId);
  target.style.display = 'flex';
  // Small delay to allow display:flex to apply before transition
  setTimeout(() => target.classList.add('active'), 50);
}

async function saveKeyAndChat() {
  const provider = document.getElementById('cloud-provider').value;
  const key = document.getElementById('api-key-input').value;
  if (!key) return alert("Please enter an API key");
  
  await window.api.saveKey(provider, key);
  document.getElementById('api-key-input').value = '';
  
  // Auto-select the saved provider in the sidebar
  document.querySelectorAll('#model-list li').forEach(el => el.classList.remove('active'));
  const targetLi = document.querySelector(`#model-list li[data-model="${provider}"]`);
  if (targetLi) targetLi.classList.add('active');
  updateModelDropdown(provider);

  showView('view-chat');
}

function downloadModel() {
  const repo = document.getElementById('hf-model-input').value;
  if (!repo) return alert("Please enter a Hugging Face repo");
  
  // In a real app, this would trigger the C++ downloader
  alert(`Downloading ${repo}... (Simulation)`);
  showView('view-chat');
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;
  
  const history = document.getElementById('chat-history');
  
  // Add user message
  const userMsg = document.createElement('div');
  userMsg.className = 'message user';
  userMsg.textContent = message;
  history.appendChild(userMsg);
  
  input.value = '';
  history.scrollTop = history.scrollHeight;
  
  // Send to backend
  const activeModelLi = document.querySelector('#model-list .active');
  const activeProvider = activeModelLi ? activeModelLi.getAttribute('data-model') : 'openai';
  const specificModel = document.getElementById('specific-model-select').value;
  
  const reply = await window.api.sendChat(message, activeProvider, specificModel, activeThreadId);
  
  allThreads = await window.api.getChatHistory();
  renderChatHistory();
}

function handleChatEnter(e) {
  if (e.key === 'Enter') {
    sendMessage();
  }
}

// Model switching logic
document.querySelectorAll('#model-list li').forEach(li => {
  li.addEventListener('click', (e) => {
    document.querySelectorAll('#model-list li').forEach(el => el.classList.remove('active'));
    e.target.classList.add('active');
    updateModelDropdown(e.target.getAttribute('data-model'));
  });
});

// Initialize app
async function initApp() {
  const savedProviders = await window.api.getSavedProviders();
  if (savedProviders && savedProviders.length > 0) {
    document.getElementById('btn-continue').style.display = 'inline-block';
    window.firstSavedProvider = savedProviders[0];
  }
  
  // Load chat threads
  allThreads = await window.api.getChatHistory();
  if (allThreads.length === 0) {
    const newThread = await window.api.createThread('Chat 1');
    allThreads.push(newThread);
  }
  activeThreadId = allThreads[0].id;
  
  renderChatThreadList();
  renderChatHistory();
  
  updateModelDropdown('openai');
  showView('view-welcome');
}

function renderChatThreadList() {
  const list = document.getElementById('chat-thread-list');
  list.innerHTML = '';
  allThreads.forEach(t => {
    const li = document.createElement('li');
    li.textContent = t.title;
    if (t.id === activeThreadId) li.classList.add('active');
    
    // Add delete button
    const delBtn = document.createElement('span');
    delBtn.innerHTML = ' &times;';
    delBtn.style.float = 'right';
    delBtn.style.cursor = 'pointer';
    delBtn.style.opacity = '0.5';
    delBtn.onmouseover = () => delBtn.style.opacity = '1';
    delBtn.onmouseout = () => delBtn.style.opacity = '0.5';
    delBtn.onclick = async (e) => {
      e.stopPropagation();
      await window.api.deleteThread(t.id);
      allThreads = allThreads.filter(x => x.id !== t.id);
      if (allThreads.length === 0) {
        const newThread = await window.api.createThread('Chat 1');
        allThreads.push(newThread);
      }
      if (activeThreadId === t.id) {
        activeThreadId = allThreads[0].id;
      }
      renderChatThreadList();
      renderChatHistory();
    };
    li.appendChild(delBtn);
    
    li.onclick = () => {
      activeThreadId = t.id;
      renderChatThreadList();
      renderChatHistory();
    };
    list.appendChild(li);
  });
}

function renderChatHistory() {
  const historyContainer = document.getElementById('chat-history');
  historyContainer.innerHTML = '';
  
  const thread = allThreads.find(t => t.id === activeThreadId);
  if (!thread || thread.messages.length === 0) {
    historyContainer.innerHTML = `<div class="message ai">Hello! I'm ready. How can I help you today?</div>`;
    return;
  }
  
  thread.messages.forEach(msg => {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${msg.role === 'user' ? 'user' : 'ai'}`;
    msgDiv.textContent = msg.content;
    historyContainer.appendChild(msgDiv);
  });
  historyContainer.scrollTop = historyContainer.scrollHeight;
}

async function createNewChat() {
  const newThread = await window.api.createThread(`Chat ${allThreads.length + 1}`);
  allThreads.unshift(newThread);
  activeThreadId = newThread.id;
  renderChatThreadList();
  renderChatHistory();
}

function continueToChat() {
  const provider = window.firstSavedProvider || 'openai';
  document.querySelectorAll('#model-list li').forEach(el => el.classList.remove('active'));
  const targetLi = document.querySelector(`#model-list li[data-model="${provider}"]`);
  if (targetLi) targetLi.classList.add('active');
  
  updateModelDropdown(provider);
  showView('view-chat');
}

document.addEventListener('DOMContentLoaded', initApp);
