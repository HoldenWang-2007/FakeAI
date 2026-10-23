const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messagesContainer = document.getElementById('messages');
const chatContainer = document.getElementById('chatContainer');
const thinkingIndicator = document.getElementById('thinkingIndicator');
const welcomeScreen = document.getElementById('welcomeScreen');
const chatScreen = document.getElementById('chatScreen');
const nicknameInput = document.getElementById('nicknameInput');
const startBtn = document.getElementById('startBtn');
const menuBtn = document.getElementById('menuBtn');
const sideMenu = document.getElementById('sideMenu');
const menuMask = document.getElementById('menuMask');
const menuNickname = document.getElementById('menuNickname');
const modelLabel = document.getElementById('modelLabel');
const userAvatar = document.querySelector('.user-avatar');
const menuAvatar = document.querySelector('.menu-avatar');
const attachBtn = document.getElementById('attachBtn');
const imageInput = document.getElementById('imageInput');
const newChatBtn = document.getElementById('newChatBtn');
const conversationList = document.getElementById('conversationList');
const welcomeDiv = chatContainer.querySelector('.welcome');

let ws = null;
let heartbeatTimer = null;
let reconnectTimer = null;
let currentNickname = null;
let currentConversationId = null;
let conversations = [];
let currentAIBubble = null;
let currentAIMessage = null;
let isThinking = false;

const NICKNAME_KEY = 'fakeai_nickname';
const CONVERSATIONS_KEY = 'fakeai_conversations_';
const CURRENT_CONV_KEY = 'fakeai_current_conv_';

const aiAvatarSVG = `<svg viewBox="0 0 24 24" fill="currentColor">
  <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073z"/>
</svg>`;

function init() {
  const savedNickname = localStorage.getItem(NICKNAME_KEY);
  if (savedNickname) {
    enterChat(savedNickname);
  } else {
    showWelcome();
  }
}

function showWelcome() {
  welcomeScreen.style.display = 'flex';
  chatScreen.style.display = 'none';
}

function enterChat(nickname) {
  currentNickname = nickname;
  localStorage.setItem(NICKNAME_KEY, nickname);

  const firstLetter = nickname.charAt(0).toUpperCase();
  userAvatar.textContent = firstLetter;
  menuAvatar.textContent = firstLetter;
  modelLabel.textContent = 'GPT-4o mini';
  menuNickname.textContent = nickname;

  loadConversations();
  connect();

  welcomeScreen.style.display = 'none';
  chatScreen.style.display = 'flex';
}

function loadConversations() {
  const key = CONVERSATIONS_KEY + currentNickname;
  const saved = localStorage.getItem(key);
  if (saved) {
    try {
      conversations = JSON.parse(saved);
    } catch (e) {
      conversations = [];
    }
  }

  if (conversations.length === 0) {
    createNewConversation(true);
  } else {
    const currentKey = CURRENT_CONV_KEY + currentNickname;
    const savedConv = localStorage.getItem(currentKey);
    if (savedConv && conversations.find(c => c.id === savedConv)) {
      currentConversationId = savedConv;
    } else {
      currentConversationId = conversations[0].id;
    }
    loadConversationMessages(currentConversationId);
  }

  renderConversationList();
}

function saveConversations() {
  const key = CONVERSATIONS_KEY + currentNickname;
  localStorage.setItem(key, JSON.stringify(conversations));
  const currentKey = CURRENT_CONV_KEY + currentNickname;
  localStorage.setItem(currentKey, currentConversationId);
}

function generateConversationId() {
  return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function createNewConversation(silent = false) {
  const id = generateConversationId();
  const newConv = {
    id: id,
    title: '新对话',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  conversations.unshift(newConv);
  currentConversationId = id;
  saveConversations();
  renderConversationList();

  if (!silent) {
    clearMessages();
    showWelcomeInChat();
    closeMenu();
  }
}

function ensureConversation(conversationId) {
  let conv = conversations.find(c => c.id === conversationId);
  if (!conv) {
    conv = {
      id: conversationId,
      title: '新对话',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    conversations.unshift(conv);
    saveConversations();
    renderConversationList();
  }
  return conv;
}

function switchConversation(conversationId) {
  if (currentConversationId === conversationId) {
    closeMenu();
    return;
  }
  currentConversationId = conversationId;
  saveConversations();
  renderConversationList();
  loadConversationMessages(conversationId);
  closeMenu();

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'get_history',
      conversationId: conversationId
    }));
  }
}

function loadConversationMessages(conversationId) {
  const conv = conversations.find(c => c.id === conversationId);
  clearMessages();

  if (!conv || conv.messages.length === 0) {
    showWelcomeInChat();
    return;
  }

  hideWelcomeInChat();
  for (const msg of conv.messages) {
    addMessage(msg, false);
  }
  scrollToBottom();
}

function renderConversationList() {
  conversationList.innerHTML = '';
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  for (const conv of sorted) {
    const item = document.createElement('button');
    item.className = 'conversation-item' + (conv.id === currentConversationId ? ' active' : '');
    const lastMsg = conv.messages.length > 0 ? conv.messages[conv.messages.length - 1] : null;
    const preview = lastMsg ? (lastMsg.messageType === 'image' ? '[图片]' : lastMsg.content) : '';

    item.innerHTML = `
      <div class="conversation-item-title">${escapeHtml(conv.title || '新对话')}</div>
      <div class="conversation-item-preview">${escapeHtml(preview)}</div>
    `;

    item.addEventListener('click', () => switchConversation(conv.id));
    conversationList.appendChild(item);
  }
}

function updateConversationInList(conv) {
  const idx = conversations.findIndex(c => c.id === conv.id);
  if (idx >= 0) {
    conversations[idx] = conv;
  }
  saveConversations();
  renderConversationList();
}

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}?type=user&nickname=${encodeURIComponent(currentNickname)}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket connected');
    startHeartbeat();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (currentConversationId) {
      ws.send(JSON.stringify({
        type: 'get_history',
        conversationId: currentConversationId
      }));
    }
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'conversation_list') {
      if (data.conversations && data.conversations.length > 0) {
        for (const serverConv of data.conversations) {
          const localConv = conversations.find(c => c.id === serverConv.id);
          if (!localConv) {
            conversations.push({
              id: serverConv.id,
              title: serverConv.title,
              messages: [],
              createdAt: serverConv.createdAt,
              updatedAt: serverConv.updatedAt
            });
          }
        }
        saveConversations();
        renderConversationList();
      }
    } else if (data.type === 'message_sent') {
      const conv = ensureConversation(data.message.conversationId);
      const existing = conv.messages.find(m => m.id === data.message.id);
      if (!existing) {
        conv.messages.push(data.message);
        conv.updatedAt = Date.now();
        updateConversationInList(conv);
      }
    } else if (data.type === 'thinking') {
      if (data.conversationId && data.conversationId !== currentConversationId) return;
      showThinking();
    } else if (data.type === 'stop_thinking') {
      hideThinking();
    } else if (data.type === 'ai_start') {
      if (data.conversationId && data.conversationId !== currentConversationId) return;
      hideWelcomeInChat();
      hideThinking();
      startAIMessage(data.messageId);
    } else if (data.type === 'ai_chunk') {
      if (data.conversationId && data.conversationId !== currentConversationId) return;
      appendAIMessage(data.content);
    } else if (data.type === 'ai_done') {
      if (data.conversationId && data.conversationId !== currentConversationId) return;
      finishAIMessage(data.content, data.conversationId);
    } else if (data.type === 'ai_image') {
      if (data.conversationId && data.conversationId !== currentConversationId) return;
      hideWelcomeInChat();
      hideThinking();
      addAIImageMessage(data.messageId, data.imageData, data.conversationId);
    } else if (data.type === 'conversation_updated') {
      const conv = ensureConversation(data.conversation.id);
      conv.title = data.conversation.title;
      conv.updatedAt = data.conversation.updatedAt;
      updateConversationInList(conv);
    } else if (data.type === 'user_history') {
      const conv = ensureConversation(data.conversationId);
      const serverMsgs = data.messages || [];
      conv.messages = serverMsgs.map(m => ({
        id: m.id,
        content: m.content,
        sender: m.sender,
        messageType: m.messageType || 'text',
        imageData: m.imageData || null,
        conversationId: data.conversationId,
        timestamp: m.timestamp
      }));
      if (serverMsgs.length > 0 && (!conv.title || conv.title === '新对话')) {
        const firstUserMsg = serverMsgs.find(m => m.sender === 'user' && m.messageType === 'text');
        if (firstUserMsg) {
          conv.title = firstUserMsg.content.substring(0, 20);
        }
      }
      if (data.conversationId === currentConversationId) {
        loadConversationMessages(currentConversationId);
      }
      saveConversations();
      renderConversationList();
    } else if (data.type === 'pong') {
    }
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
    stopHeartbeat();
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 3000);
    }
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
  };
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 25000);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function sendMessage() {
  const content = messageInput.value.trim();
  if (!content) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    alert('连接中，请稍候再试');
    return;
  }

  if (!currentConversationId) {
    createNewConversation(true);
  }

  ws.send(JSON.stringify({
    type: 'user_message',
    content: content,
    messageType: 'text',
    conversationId: currentConversationId
  }));

  const userMsg = {
    id: Date.now(),
    content: content,
    sender: 'user',
    messageType: 'text',
    conversationId: currentConversationId,
    timestamp: new Date().toISOString()
  };

  addMessage(userMsg, true);

  const conv = conversations.find(c => c.id === currentConversationId);
  if (conv) {
    conv.messages.push(userMsg);
    if (!conv.title || conv.title === '新对话') {
      conv.title = content.substring(0, 20);
    }
    conv.updatedAt = Date.now();
    updateConversationInList(conv);
  }

  messageInput.value = '';
  messageInput.blur();
  messageInput.focus();
  autoResize();
  updateSendButton();
}

function handleImageSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    alert('图片大小不能超过 5MB');
    imageInput.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const imageData = event.target.result;
    sendImage(imageData);
    imageInput.value = '';
  };
  reader.readAsDataURL(file);
}

function sendImage(imageData) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    alert('连接中，请稍候再试');
    return;
  }

  if (!currentConversationId) {
    createNewConversation(true);
  }

  ws.send(JSON.stringify({
    type: 'user_message',
    content: '[图片]',
    messageType: 'image',
    imageData: imageData,
    conversationId: currentConversationId
  }));

  const userMsg = {
    id: Date.now(),
    content: '[图片]',
    sender: 'user',
    messageType: 'image',
    imageData: imageData,
    conversationId: currentConversationId,
    timestamp: new Date().toISOString()
  };

  addMessage(userMsg, true);

  const conv = conversations.find(c => c.id === currentConversationId);
  if (conv) {
    conv.messages.push(userMsg);
    conv.updatedAt = Date.now();
    updateConversationInList(conv);
  }
}

function addMessage(message, scroll = true) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${message.sender}`;
  if (message.id) {
    msgDiv.id = `msg-${message.id}`;
  }

  let avatarHTML = '';
  if (message.sender === 'ai') {
    avatarHTML = `<div class="message-avatar">${aiAvatarSVG}</div>`;
  }

  let contentHTML = '';
  if (message.messageType === 'image' && message.imageData) {
    contentHTML = `<div class="message-image"><img src="${message.imageData}" alt="图片" onclick="window.open(this.src)"></div>`;
  } else {
    contentHTML = `<div class="message-bubble">${escapeHtml(message.content)}</div>`;
  }

  msgDiv.innerHTML = `
    ${avatarHTML}
    <div class="message-content">
      ${contentHTML}
    </div>
  `;

  messagesContainer.appendChild(msgDiv);
  if (scroll) scrollToBottom();
}

function showThinking() {
  isThinking = true;
  hideWelcomeInChat();
  thinkingIndicator.style.display = 'flex';
  scrollToBottom();
}

function hideThinking() {
  isThinking = false;
  thinkingIndicator.style.display = 'none';
}

function startAIMessage(messageId) {
  currentAIMessage = { id: messageId, content: '', sender: 'ai' };

  const msgDiv = document.createElement('div');
  msgDiv.className = 'message ai';
  msgDiv.id = `msg-${messageId}`;

  msgDiv.innerHTML = `
    <div class="message-avatar">${aiAvatarSVG}</div>
    <div class="message-content">
      <div class="message-bubble typing"></div>
    </div>
  `;

  messagesContainer.appendChild(msgDiv);
  currentAIBubble = msgDiv.querySelector('.message-bubble');
  scrollToBottom();
}

function appendAIMessage(chunk) {
  if (currentAIBubble) {
    currentAIMessage.content += chunk;
    currentAIBubble.textContent = currentAIMessage.content;
    scrollToBottom();
  }
}

function finishAIMessage(fullContent, conversationId) {
  if (currentAIBubble) {
    currentAIMessage.content = fullContent;
    currentAIBubble.textContent = fullContent;
    currentAIBubble.classList.remove('typing');

    if (conversationId) {
      const conv = ensureConversation(conversationId);
      conv.messages.push({
        id: currentAIMessage.id,
        content: fullContent,
        sender: 'ai',
        messageType: 'text',
        conversationId: conversationId,
        timestamp: new Date().toISOString()
      });
      if (!conv.title || conv.title === '新对话') {
        conv.title = fullContent.substring(0, 20);
      }
      conv.updatedAt = Date.now();
      updateConversationInList(conv);
    }
  }
  currentAIMessage = null;
  currentAIBubble = null;
  scrollToBottom();
}

function addAIImageMessage(messageId, imageData, conversationId) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message ai';
  msgDiv.id = `msg-${messageId}`;

  msgDiv.innerHTML = `
    <div class="message-avatar">${aiAvatarSVG}</div>
    <div class="message-content">
      <div class="message-image"><img src="${imageData}" alt="图片" onclick="window.open(this.src)"></div>
    </div>
  `;

  messagesContainer.appendChild(msgDiv);

  if (conversationId) {
    const conv = ensureConversation(conversationId);
    conv.messages.push({
      id: messageId,
      content: '[图片]',
      sender: 'ai',
      messageType: 'image',
      imageData: imageData,
      conversationId: conversationId,
      timestamp: new Date().toISOString()
    });
    conv.updatedAt = Date.now();
    updateConversationInList(conv);
  }

  scrollToBottom();
}

function clearMessages() {
  messagesContainer.innerHTML = '';
  currentAIMessage = null;
  currentAIBubble = null;
  hideThinking();
}

function showWelcomeInChat() {
  welcomeDiv.style.display = 'flex';
}

function hideWelcomeInChat() {
  welcomeDiv.style.display = 'none';
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function updateSendButton() {
  if (messageInput.value.trim()) {
    sendBtn.classList.add('active');
    sendBtn.disabled = false;
  } else {
    sendBtn.classList.remove('active');
    sendBtn.disabled = true;
  }
}

function openMenu() {
  sideMenu.classList.add('open');
}

function closeMenu() {
  sideMenu.classList.remove('open');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function autoResize() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
}

document.addEventListener('DOMContentLoaded', () => {
  init();

  startBtn.addEventListener('click', () => {
    const nickname = nicknameInput.value.trim();
    if (!nickname) {
      nicknameInput.focus();
      return;
    }
    enterChat(nickname);
  });

  nicknameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      startBtn.click();
    }
  });

  menuBtn.addEventListener('click', openMenu);
  menuMask.addEventListener('click', closeMenu);

  sendBtn.addEventListener('click', sendMessage);

  attachBtn.addEventListener('click', () => imageInput.click());
  imageInput.addEventListener('change', handleImageSelect);

  newChatBtn.addEventListener('click', () => createNewConversation());

  messageInput.addEventListener('input', () => {
    autoResize();
    updateSendButton();
  });

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  updateSendButton();
});
