const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const mysql = require('mysql2/promise');

require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'fakeai';

const SYSTEM_PROMPT = `你是 ChatGPT，由 OpenAI 开发的人工智能助手。
请以 ChatGPT 的身份与用户对话，回答问题、提供帮助。
保持友好、专业、有帮助的态度。
不要透露你实际上是 DeepSeek 或其他模型，始终以 ChatGPT 的身份回应。
回答要简洁明了，符合 ChatGPT 的说话风格。`;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

let pool = null;
const userSockets = {};
const adminSockets = new Set();

async function initDB() {
  pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
  });
  try {
    const conn = await pool.getConnection();
    await conn.query('SELECT 1');
    conn.release();
    console.log('MySQL 数据库连接成功');
  } catch (err) {
    console.error('MySQL 数据库连接失败:', err.message);
    console.log('请检查环境变量 DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME 是否正确配置');
  }
}

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

async function ensureUser(nickname) {
  const now = Date.now();
  const [rows] = await pool.query('SELECT nickname FROM users WHERE nickname = ?', [nickname]);
  if (rows.length === 0) {
    await pool.query('INSERT INTO users (nickname, last_active) VALUES (?, ?)', [nickname, now]);
  } else {
    await pool.query('UPDATE users SET last_active = ? WHERE nickname = ?', [now, nickname]);
  }
}

async function updateUserActive(nickname) {
  await pool.query('UPDATE users SET last_active = ? WHERE nickname = ?', [Date.now(), nickname]);
}

async function getConversation(nickname, conversationId) {
  const [rows] = await pool.query(
    'SELECT * FROM conversations WHERE id = ? AND nickname = ?',
    [conversationId, nickname]
  );
  if (rows.length > 0) return rows[0];

  const now = Date.now();
  await pool.query(
    'INSERT INTO conversations (id, nickname, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [conversationId, nickname, '', now, now]
  );
  const [newRows] = await pool.query(
    'SELECT * FROM conversations WHERE id = ? AND nickname = ?',
    [conversationId, nickname]
  );
  return newRows[0];
}

async function getConversationList(nickname) {
  const [rows] = await pool.query(
    `SELECT c.id, c.title, c.created_at, c.updated_at,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count,
            (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message
     FROM conversations c
     WHERE c.nickname = ?
     ORDER BY c.updated_at DESC`,
    [nickname]
  );
  return rows.map(r => ({
    id: r.id,
    title: r.title || '新对话',
    messageCount: r.message_count || 0,
    lastMessage: r.last_message || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

async function getMessages(conversationId) {
  const [rows] = await pool.query(
    `SELECT id, conversation_id, nickname, sender, content, message_type, image_data,
            DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS timestamp
     FROM messages
     WHERE conversation_id = ?
     ORDER BY id ASC`,
    [conversationId]
  );
  return rows.map(r => ({
    id: r.id,
    content: r.content,
    sender: r.sender,
    nickname: r.nickname,
    conversationId: r.conversation_id,
    messageType: r.message_type,
    imageData: r.image_data,
    timestamp: r.timestamp
  }));
}

async function addMessage(conversationId, nickname, sender, content, messageType, imageData) {
  const [result] = await pool.query(
    `INSERT INTO messages (conversation_id, nickname, sender, content, message_type, image_data)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [conversationId, nickname, sender, content, messageType || 'text', imageData || null]
  );
  const now = Date.now();
  await pool.query(
    'UPDATE conversations SET updated_at = ? WHERE id = ?',
    [now, conversationId]
  );
  const [msgRows] = await pool.query(
    `SELECT id, conversation_id, nickname, sender, content, message_type, image_data,
            DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS timestamp
     FROM messages WHERE id = ?`,
    [result.insertId]
  );
  const msg = msgRows[0];
  return {
    id: msg.id,
    content: msg.content,
    sender: msg.sender,
    nickname: msg.nickname,
    conversationId: msg.conversation_id,
    messageType: msg.message_type,
    imageData: msg.image_data,
    timestamp: msg.timestamp
  };
}

async function updateConversationTitle(conversationId, title) {
  await pool.query(
    'UPDATE conversations SET title = ? WHERE id = ? AND (title IS NULL OR title = "")',
    [title, conversationId]
  );
}

async function clearConversation(conversationId) {
  await pool.query('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
  await pool.query('UPDATE conversations SET updated_at = ? WHERE id = ?', [Date.now(), conversationId]);
}

async function getUserList() {
  const [rows] = await pool.query(
    `SELECT u.nickname, u.last_active,
            (SELECT COUNT(*) FROM messages m WHERE m.nickname = u.nickname) AS message_count,
            (SELECT COUNT(*) FROM conversations c WHERE c.nickname = u.nickname) AS conversation_count,
            (SELECT content FROM messages m WHERE m.nickname = u.nickname ORDER BY m.id DESC LIMIT 1) AS last_message
     FROM users u
     ORDER BY u.last_active DESC`
  );
  return rows.map(r => ({
    nickname: r.nickname,
    messageCount: r.message_count || 0,
    conversationCount: r.conversation_count || 0,
    isOnline: !!userSockets[r.nickname] && userSockets[r.nickname].readyState === WebSocket.OPEN,
    lastActive: r.last_active,
    lastMessage: r.last_message || ''
  }));
}

function broadcastToAdmins(data) {
  const msg = JSON.stringify(data);
  for (const admin of adminSockets) {
    if (admin.readyState === WebSocket.OPEN) {
      admin.send(msg);
    }
  }
}

async function broadcastUserList() {
  const users = await getUserList();
  broadcastToAdmins({ type: 'user_list', users });
}

setInterval(() => {
  if (adminSockets.size > 0) {
    broadcastUserList();
  }
}, 30000);

async function callDeepSeekAPI(convMessages) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DeepSeek API Key 未配置');
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...convMessages.map(m => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.content
    }))
  ];

  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: messages,
      stream: true
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API 请求失败: ${response.status} - ${errText}`);
  }

  return response.body;
}

async function streamAIReply(nickname, conversationId, stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullContent = '';
  let started = false;
  let newMessage = null;

  async function finish() {
    newMessage = await addMessage(conversationId, nickname, 'ai', fullContent, 'text', null);

    const userSocket = userSockets[nickname];
    if (userSocket && userSocket.readyState === WebSocket.OPEN) {
      userSocket.send(JSON.stringify({
        type: 'ai_done',
        messageId: newMessage.id,
        conversationId: conversationId,
        content: fullContent
      }));
      const convList = await getConversationList(nickname);
      const convInfo = convList.find(c => c.id === conversationId);
      userSocket.send(JSON.stringify({
        type: 'conversation_updated',
        conversation: convInfo
      }));
    }

    for (const admin of adminSockets) {
      if (admin.readyState === WebSocket.OPEN) {
        admin.send(JSON.stringify({
          type: 'message_sent',
          nickname: nickname,
          conversationId: conversationId,
          message: newMessage
        }));
      }
    }
    broadcastToAdmins({ type: 'user_list', users: await getUserList() });
  }

  function processChunk() {
    reader.read().then(({ done, value }) => {
      if (done) {
        finish();
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const dataStr = trimmed.slice(6);
        if (dataStr === '[DONE]') continue;

        try {
          const data = JSON.parse(dataStr);
          const delta = data.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullContent += delta;

            if (!started) {
              started = true;
              const userSocket = userSockets[nickname];
              if (userSocket && userSocket.readyState === WebSocket.OPEN) {
                userSocket.send(JSON.stringify({ type: 'stop_thinking' }));
                userSocket.send(JSON.stringify({
                  type: 'ai_start',
                  messageId: 'streaming',
                  conversationId: conversationId
                }));
              }
            }

            const userSocket = userSockets[nickname];
            if (userSocket && userSocket.readyState === WebSocket.OPEN) {
              userSocket.send(JSON.stringify({
                type: 'ai_chunk',
                messageId: 'streaming',
                conversationId: conversationId,
                content: delta
              }));
            }
          }
        } catch (e) {
          // 忽略解析错误
        }
      }

      processChunk();
    }).catch(err => {
      console.error('流式响应错误:', err);
      const userSocket = userSockets[nickname];
      if (userSocket && userSocket.readyState === WebSocket.OPEN) {
        userSocket.send(JSON.stringify({ type: 'stop_thinking' }));
      }
    });
  }

  processChunk();
}

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const clientType = url.searchParams.get('type');
  const nickname = url.searchParams.get('nickname');

  if (clientType === 'user' && nickname) {
    await ensureUser(nickname);
    userSockets[nickname] = ws;
    ws.userNickname = nickname;

    console.log(`User connected: ${nickname}`);

    const convList = await getConversationList(nickname);
    ws.send(JSON.stringify({
      type: 'conversation_list',
      conversations: convList,
      nickname: nickname
    }));

    broadcastToAdmins({ type: 'user_list', users: await getUserList() });

  } else if (clientType === 'admin') {
    adminSockets.add(ws);
    console.log('Admin connected');
    ws.send(JSON.stringify({ type: 'user_list', users: await getUserList() }));
  }

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.type === 'user_message' && ws.userNickname) {
        const nickname = ws.userNickname;
        await updateUserActive(nickname);
        const conversationId = msg.conversationId || 'default';
        await getConversation(nickname, conversationId);

        const newMessage = await addMessage(
          conversationId, nickname, 'user', msg.content,
          msg.messageType || 'text', msg.imageData || null
        );

        if (!msg.imageData && msg.messageType === 'text') {
          await updateConversationTitle(conversationId, msg.content.substring(0, 20));
        }

        ws.send(JSON.stringify({ type: 'message_sent', message: newMessage }));
        if (newMessage.messageType === 'text') {
          ws.send(JSON.stringify({ type: 'thinking' }));
        }

        const convList = await getConversationList(nickname);
        const convInfo = convList.find(c => c.id === conversationId);
        ws.send(JSON.stringify({
          type: 'conversation_updated',
          conversation: convInfo
        }));

        broadcastToAdmins({
          type: 'new_message',
          nickname: nickname,
          conversationId: conversationId,
          message: newMessage
        });
        broadcastToAdmins({ type: 'user_list', users: await getUserList() });

      } else if (msg.type === 'get_history' && ws.userNickname) {
        const conversationId = msg.conversationId || 'default';
        const messages = await getMessages(conversationId);
        ws.send(JSON.stringify({
          type: 'user_history',
          nickname: ws.userNickname,
          conversationId: conversationId,
          messages: messages
        }));

      } else if (msg.type === 'get_conversations' && ws.userNickname) {
        const convList = await getConversationList(ws.userNickname);
        ws.send(JSON.stringify({
          type: 'conversation_list',
          conversations: convList,
          nickname: ws.userNickname
        }));

      } else if (msg.type === 'admin_reply' && adminSockets.has(ws)) {
        const targetNickname = msg.nickname;
        const conversationId = msg.conversationId || 'default';
        await getConversation(targetNickname, conversationId);

        const newMessage = await addMessage(
          conversationId, targetNickname, 'ai', msg.content,
          msg.messageType || 'text', msg.imageData || null
        );

        if (msg.messageType === 'text') {
          await updateConversationTitle(conversationId, msg.content.substring(0, 20));
        }

        const userSocket = userSockets[targetNickname];
        if (userSocket && userSocket.readyState === WebSocket.OPEN) {
          if (newMessage.messageType === 'image') {
            userSocket.send(JSON.stringify({ type: 'stop_thinking' }));
            userSocket.send(JSON.stringify({
              type: 'ai_image',
              messageId: newMessage.id,
              conversationId: conversationId,
              imageData: newMessage.imageData
            }));
          } else {
            userSocket.send(JSON.stringify({ type: 'stop_thinking' }));
            userSocket.send(JSON.stringify({
              type: 'ai_start',
              messageId: newMessage.id,
              conversationId: conversationId
            }));

            const content = msg.content;
            let index = 0;
            const streamInterval = setInterval(async () => {
              if (index >= content.length) {
                clearInterval(streamInterval);
                if (userSocket && userSocket.readyState === WebSocket.OPEN) {
                  userSocket.send(JSON.stringify({
                    type: 'ai_done',
                    messageId: newMessage.id,
                    conversationId: conversationId,
                    content: content
                  }));
                  const convList = await getConversationList(targetNickname);
                  const convInfo = convList.find(c => c.id === conversationId);
                  userSocket.send(JSON.stringify({
                    type: 'conversation_updated',
                    conversation: convInfo
                  }));
                }
                return;
              }

              const chunkSize = Math.floor(Math.random() * 3) + 1;
              const chunk = content.substring(index, index + chunkSize);
              index += chunkSize;

              if (userSocket && userSocket.readyState === WebSocket.OPEN) {
                userSocket.send(JSON.stringify({
                  type: 'ai_chunk',
                  messageId: newMessage.id,
                  conversationId: conversationId,
                  content: chunk
                }));
              }
            }, 30 + Math.random() * 40);
          }
        }

        for (const admin of adminSockets) {
          if (admin.readyState === WebSocket.OPEN) {
            admin.send(JSON.stringify({
              type: 'message_sent',
              nickname: targetNickname,
              conversationId: conversationId,
              message: newMessage
            }));
          }
        }

        broadcastToAdmins({ type: 'user_list', users: await getUserList() });

      } else if (msg.type === 'get_conversations' && adminSockets.has(ws)) {
        const convList = await getConversationList(msg.nickname);
        ws.send(JSON.stringify({
          type: 'conversation_list',
          nickname: msg.nickname,
          conversations: convList
        }));

      } else if (msg.type === 'get_history' && adminSockets.has(ws)) {
        const conversationId = msg.conversationId || 'default';
        const messages = await getMessages(conversationId);
        ws.send(JSON.stringify({
          type: 'user_history',
          nickname: msg.nickname,
          conversationId: conversationId,
          messages: messages
        }));

      } else if (msg.type === 'clear_chat' && adminSockets.has(ws)) {
        const conversationId = msg.conversationId || 'default';
        await clearConversation(conversationId);
        broadcastToAdmins({
          type: 'chat_cleared',
          nickname: msg.nickname,
          conversationId: conversationId
        });
        broadcastToAdmins({ type: 'user_list', users: await getUserList() });

      } else if (msg.type === 'ping' && adminSockets.has(ws)) {
        const users = await getUserList();
        ws.send(JSON.stringify({ type: 'user_list', users }));

      } else if (msg.type === 'ping' && ws.userNickname) {
        await updateUserActive(ws.userNickname);
        ws.send(JSON.stringify({ type: 'pong' }));

      } else if (msg.type === 'ai_reply' && adminSockets.has(ws)) {
        const targetNickname = msg.nickname;
        const conversationId = msg.conversationId || 'default';

        if (!DEEPSEEK_API_KEY) {
          ws.send(JSON.stringify({
            type: 'ai_reply_error',
            nickname: targetNickname,
            conversationId: conversationId,
            error: 'DeepSeek API Key 未配置'
          }));
          return;
        }

        const messages = await getMessages(conversationId);
        const textMessages = messages.filter(m => m.messageType === 'text');

        const userSocket = userSockets[targetNickname];
        if (userSocket && userSocket.readyState === WebSocket.OPEN) {
          userSocket.send(JSON.stringify({ type: 'thinking' }));
        }

        callDeepSeekAPI(textMessages)
          .then(stream => {
            streamAIReply(targetNickname, conversationId, stream);
          })
          .catch(err => {
            console.error('DeepSeek API 调用失败:', err);
            const userSocket = userSockets[targetNickname];
            if (userSocket && userSocket.readyState === WebSocket.OPEN) {
              userSocket.send(JSON.stringify({ type: 'stop_thinking' }));
            }
            ws.send(JSON.stringify({
              type: 'ai_reply_error',
              nickname: targetNickname,
              conversationId: conversationId,
              error: err.message
            }));
          });
      }
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  });

  ws.on('close', async () => {
    if (ws.userNickname) {
      if (userSockets[ws.userNickname] === ws) {
        userSockets[ws.userNickname] = null;
        console.log(`User disconnected: ${ws.userNickname}`);
      }
      broadcastToAdmins({ type: 'user_list', users: await getUserList() });
    } else if (adminSockets.has(ws)) {
      adminSockets.delete(ws);
      console.log('Admin disconnected');
    }
  });
});

async function start() {
  await initDB();
  server.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log('');
    console.log('========================================');
    console.log('  FakeAI 聊天服务器已启动');
    console.log('========================================');
    console.log('');
    console.log('  手机端用户访问:');
    console.log(`    http://${localIP}:${PORT}/`);
    console.log('');
    console.log('  电脑端管理后台:');
    console.log(`    http://localhost:${PORT}/admin.html`);
    console.log(`    http://${localIP}:${PORT}/admin.html`);
    console.log('');
    console.log('========================================');
  });
}

start();
