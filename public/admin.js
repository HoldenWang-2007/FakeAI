const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '?type=admin';
let ws = null;
let currentNickname = null;
let currentConversationId = null;
let userList = [];
let conversations = [];

const userListEl = document.getElementById('userList');
const userCountEl = document.getElementById('userCount');
const chatPanel = document.getElementById('chatPanel');
const userListPanel = document.getElementById('userListPanel');
const chatUserNameEl = document.getElementById('chatUserName');
const chatUserAvatarEl = document.getElementById('chatUserAvatar');
const chatUserStatusEl = document.getElementById('chatUserStatus');
const messageCountEl = document.getElementById('messageCount');
const messagesContainer = document.getElementById('messagesContainer');
const replyInput = document.getElementById('replyInput');
const replyBtn = document.getElementById('replyBtn');
const clearBtn = document.getElementById('clearBtn');
const imageBtn = document.getElementById('imageBtn');
const adminImageInput = document.getElementById('adminImageInput');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const backBtn = document.getElementById('backBtn');
const headerTitle = document.getElementById('headerTitle');
const convTabsList = document.getElementById('convTabsList');

let audioCtx = null;
let refreshTimer = null;

function playNotificationSound() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
    oscillator.frequency.setValueAtTime(660, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.3);
  } catch (e) {
    console.warn('无法播放提示音:', e);
  }
}

function init() {
  connect();
  setupEventListeners();
  updateUrls();
}

function startRefreshTimer() {
  stopRefreshTimer();
  refreshTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 30000);
}

function stopRefreshTimer() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function connect() {
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    statusDot.className = 'status-dot online';
    statusText.textContent = '已连接';
    if (currentNickname) {
      ws.send(JSON.stringify({ type: 'get_conversations', nickname: currentNickname }));
      if (currentConversationId) {
        ws.send(JSON.stringify({
          type: 'get_history',
          nickname: currentNickname,
          conversationId: currentConversationId
        }));
      }
    }
    startRefreshTimer();
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'user_list') {
      userList = data.users;
      renderUserList();
      if (currentNickname) {
        const user = userList.find(u => u.nickname === currentNickname);
        if (user) {
          chatUserStatusEl.textContent = user.isOnline ? '在线' : '离线';
          chatUserStatusEl.className = 'chat-user-status' + (user.isOnline ? ' online' : '');
        }
      }
    } else if (data.type === 'conversation_list') {
      if (data.nickname === currentNickname) {
        conversations = data.conversations;
        renderConversationTabs();
        if (!currentConversationId && conversations.length > 0) {
          selectConversation(conversations[0].id);
        }
      }
    } else if (data.type === 'new_message') {
      playNotificationSound();
      if (data.nickname === currentNickname && data.conversationId === currentConversationId) {
        appendMessage(data.message);
        const count = messagesContainer.querySelectorAll('.message').length;
        messageCountEl.textContent = `${count} 条消息`;
      }
      if (data.nickname === currentNickname) {
        const conv = conversations.find(c => c.id === data.conversationId);
        if (conv) {
          conv.lastMessage = data.message.content;
          conv.messageCount = (conv.messageCount || 0) + 1;
          conv.updatedAt = Date.now();
          renderConversationTabs();
        }
      }
      updateUserInList(data.nickname);
    } else if (data.type === 'message_sent') {
      if (data.nickname === currentNickname && data.conversationId === currentConversationId) {
        appendMessage(data.message);
        const count = messagesContainer.querySelectorAll('.message').length;
        messageCountEl.textContent = `${count} 条消息`;
      }
      if (data.nickname === currentNickname) {
        const conv = conversations.find(c => c.id === data.conversationId);
        if (conv) {
          conv.lastMessage = data.message.content;
          conv.messageCount = (conv.messageCount || 0) + 1;
          conv.updatedAt = Date.now();
          renderConversationTabs();
        }
      }
    } else if (data.type === 'user_history') {
      if (data.nickname === currentNickname && data.conversationId === currentConversationId) {
        renderMessages(data.messages);
      }
    } else if (data.type === 'chat_cleared') {
      if (data.nickname === currentNickname && data.conversationId === currentConversationId) {
        renderMessages([]);
      }
    } else if (data.type === 'ai_reply_error') {
      if (data.nickname === currentNickname && data.conversationId === currentConversationId) {
        alert('AI 回复失败: ' + data.error);
      }
    }
  };

  ws.onclose = () => {
    statusDot.className = 'status-dot';
    statusText.textContent = '连接断开';
    stopRefreshTimer();
    setTimeout(connect, 3000);
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
  };
}

function setupEventListeners() {
  replyBtn.addEventListener('click', sendReply);
  clearBtn.addEventListener('click', clearChat);
  backBtn.addEventListener('click', showUserList);

  replyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  });

  replyInput.addEventListener('input', () => {
    replyInput.style.height = 'auto';
    replyInput.style.height = Math.min(replyInput.scrollHeight, 120) + 'px';
  });

  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      replyInput.value = btn.dataset.text;
      replyInput.focus();
      replyInput.style.height = 'auto';
      replyInput.style.height = Math.min(replyInput.scrollHeight, 120) + 'px';
    });
  });

  imageBtn.addEventListener('click', () => adminImageInput.click());
  adminImageInput.addEventListener('change', handleAdminImageSelect);

  messagesContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.ai-reply-btn');
    if (btn) {
      triggerAIReply();
    }
  });
}

function handleAdminImageSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    alert('图片大小不能超过 5MB');
    adminImageInput.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const imageData = event.target.result;
    sendImageReply(imageData);
    adminImageInput.value = '';
  };
  reader.readAsDataURL(file);
}

function sendImageReply(imageData) {
  if (!currentNickname || !currentConversationId) return;

  ws.send(JSON.stringify({
    type: 'admin_reply',
    nickname: currentNickname,
    conversationId: currentConversationId,
    content: '[图片]',
    messageType: 'image',
    imageData: imageData
  }));

  appendMessage({
    sender: 'ai',
    content: '[图片]',
    messageType: 'image',
    imageData: imageData,
    timestamp: new Date().toISOString()
  });

  const count = messagesContainer.querySelectorAll('.message').length;
  messageCountEl.textContent = `${count} 条消息`;
}

function renderUserList() {
  userCountEl.textContent = `${userList.length} 位用户`;

  if (userList.length === 0) {
    userListEl.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <p>暂无用户</p>
      </div>
    `;
    return;
  }

  userListEl.innerHTML = userList.map(user => `
    <div class="user-item ${user.nickname === currentNickname ? 'active' : ''}" data-nickname="${user.nickname}" onclick="selectUser('${user.nickname}')">
      <div class="user-avatar">${user.nickname.charAt(0).toUpperCase()}</div>
      <div class="user-info">
        <div class="user-name-row">
          <span class="user-name">${escapeHtml(user.nickname)}</span>
          <span class="user-online ${user.isOnline ? 'online' : ''}"></span>
        </div>
        <div class="user-last-msg">${escapeHtml(user.lastMessage || '暂无消息')}</div>
      </div>
      <div class="user-meta">
        <span class="msg-count">${user.messageCount || 0}</span>
        <span class="conv-count">${user.conversationCount || 0} 对话</span>
      </div>
    </div>
  `).join('');
}

function updateUserInList(nickname) {
  const idx = userList.findIndex(u => u.nickname === nickname);
  if (idx >= 0) {
    const user = userList[idx];
    user.lastActive = Date.now();
    userList.splice(idx, 1);
    userList.unshift(user);
    renderUserList();
  }
}

function selectUser(nickname) {
  currentNickname = nickname;
  currentConversationId = null;
  conversations = [];

  const user = userList.find(u => u.nickname === nickname);
  if (user) {
    chatUserNameEl.textContent = user.nickname;
    chatUserAvatarEl.textContent = user.nickname.charAt(0).toUpperCase();
    chatUserStatusEl.textContent = user.isOnline ? '在线' : '离线';
    chatUserStatusEl.className = 'chat-user-status' + (user.isOnline ? ' online' : '');
  }

  convTabsList.innerHTML = '';
  messagesContainer.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <p>加载对话中...</p>
    </div>
  `;
  messageCountEl.textContent = '0 条消息';

  ws.send(JSON.stringify({ type: 'get_conversations', nickname }));
  showChatPanel();
  renderUserList();
}

function renderConversationTabs() {
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  convTabsList.innerHTML = sorted.map(conv => `
    <button class="conv-tab ${conv.id === currentConversationId ? 'active' : ''}" onclick="selectConversation('${conv.id}')">
      ${escapeHtml(conv.title || '新对话')}
    </button>
  `).join('');
}

function selectConversation(conversationId) {
  currentConversationId = conversationId;
  renderConversationTabs();

  messagesContainer.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <p>加载消息中...</p>
    </div>
  `;
  messageCountEl.textContent = '0 条消息';

  ws.send(JSON.stringify({
    type: 'get_history',
    nickname: currentNickname,
    conversationId: conversationId
  }));
}

function showChatPanel() {
  chatPanel.style.display = 'flex';
  if (window.innerWidth <= 768) {
    userListPanel.style.display = 'none';
    backBtn.style.display = 'flex';
    headerTitle.querySelector('h1').textContent = currentNickname;
  }
}

function showUserList() {
  chatPanel.style.display = 'none';
  userListPanel.style.display = 'flex';
  backBtn.style.display = 'none';
  headerTitle.querySelector('h1').textContent = 'FakeAI 管理后台';
}

function sendReply() {
  const content = replyInput.value.trim();
  if (!content || !currentNickname || !currentConversationId) return;

  ws.send(JSON.stringify({
    type: 'admin_reply',
    nickname: currentNickname,
    conversationId: currentConversationId,
    content: content
  }));

  appendMessage({ sender: 'ai', content, timestamp: new Date().toISOString() });

  const count = messagesContainer.querySelectorAll('.message').length;
  messageCountEl.textContent = `${count} 条消息`;

  replyInput.value = '';
  replyInput.style.height = 'auto';
}

function clearChat() {
  if (!currentNickname || !currentConversationId) return;
  if (!confirm('确定要清空当前对话吗？')) return;

  ws.send(JSON.stringify({
    type: 'clear_chat',
    nickname: currentNickname,
    conversationId: currentConversationId
  }));
  renderMessages([]);
}

function renderMessages(messages) {
  const filtered = messages.filter(m => m.sender === 'user' || m.sender === 'ai');
  messageCountEl.textContent = `${filtered.length} 条消息`;

  if (filtered.length === 0) {
    messagesContainer.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <p>暂无对话消息</p>
      </div>
    `;
    return;
  }

  messagesContainer.innerHTML = filtered.map(msg => {
    const isUser = msg.sender === 'user';
    let contentHTML = '';
    if (msg.messageType === 'image' && msg.imageData) {
      contentHTML = `<div class="msg-image"><img src="${msg.imageData}" alt="图片" onclick="window.open(this.src)"></div>`;
    } else {
      contentHTML = `<div class="message-bubble">${escapeHtml(msg.content)}</div>`;
    }
    const aiBtn = (isUser && msg.messageType !== 'image') ? `
      <button class="ai-reply-btn" title="用 AI 回复">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/>
          <path d="M4 20a8 8 0 0 1 16 0"/>
        </svg>
        AI回复
      </button>
    ` : '';
    return `
      <div class="message ${isUser ? 'user' : 'ai'}">
        <div class="message-content">
          ${contentHTML}
          <div class="message-meta">${formatTime(msg.timestamp)}${aiBtn}</div>
        </div>
      </div>
    `;
  }).join('');

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function appendMessage(msg) {
  const isUser = msg.sender === 'user';
  let contentHTML = '';
  if (msg.messageType === 'image' && msg.imageData) {
    contentHTML = `<div class="msg-image"><img src="${msg.imageData}" alt="图片" onclick="window.open(this.src)"></div>`;
  } else {
    contentHTML = `<div class="message-bubble">${escapeHtml(msg.content)}</div>`;
  }
  const aiBtn = (isUser && msg.messageType !== 'image') ? `
    <button class="ai-reply-btn" title="用 AI 回复">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/>
        <path d="M4 20a8 8 0 0 1 16 0"/>
      </svg>
      AI回复
    </button>
  ` : '';
  const html = `
    <div class="message ${isUser ? 'user' : 'ai'}">
      <div class="message-content">
        ${contentHTML}
        <div class="message-meta">${formatTime(msg.timestamp)}${aiBtn}</div>
      </div>
    </div>
  `;

  const emptyEl = messagesContainer.querySelector('.empty-state');
  if (emptyEl) {
    messagesContainer.innerHTML = html;
  } else {
    messagesContainer.insertAdjacentHTML('beforeend', html);
  }

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function triggerAIReply() {
  if (!currentNickname || !currentConversationId) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    alert('WebSocket 未连接');
    return;
  }
  ws.send(JSON.stringify({
    type: 'ai_reply',
    nickname: currentNickname,
    conversationId: currentConversationId
  }));
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  if (sameDay) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isYesterday) {
    return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' +
    date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function updateUrls() {
  const mobileUrl = document.getElementById('mobileUrl');
  const adminUrl = document.getElementById('adminUrl');
  mobileUrl.textContent = location.origin + '/';
  adminUrl.textContent = location.origin + '/admin.html';
}

function copyUrl(elementId) {
  const text = document.getElementById(elementId).textContent;
  navigator.clipboard.writeText(text).then(() => {
    alert('已复制到剪贴板');
  }).catch(() => {
    alert('复制失败，请手动复制');
  });
}

init();
