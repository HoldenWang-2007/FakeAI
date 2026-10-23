# FakeAI - 模拟 ChatGPT 聊天应用 | Simulated ChatGPT Chat App

[中文](#中文) | [English](#english)

---

## 中文

一个模拟 ChatGPT 风格的假 AI 聊天应用，支持后台人工回复和 AI 自动回复两种模式。

### 功能特性

#### 客户端（用户端）
- 🎨 ChatGPT 风格 UI，白底极简设计
- 💬 气泡聊天界面，支持文字和图片消息
- ⏳ 未回复时显示思考动画
- ⌨️ AI 回复以打字机效果逐字流式显示
- 👤 昵称系统，本地持久化保存
- 📝 多会话历史对话管理
- 🔄 断线自动重连，消息同步不丢失
- 📱 移动端完美适配

#### 管理后台
- 👥 多用户管理，查看所有在线用户
- 💬 实时消息推送，新消息提示音
- 🤖 每条消息可选择 AI 自动回复或手动回复
- 🖼️ 支持发送图片消息
- 📱 移动端竖屏适配
- 🔔 新消息声音提醒

#### 后端
- ⚡ Node.js + Express + WebSocket
- 🗄️ MySQL 数据库持久化存储
- 🔌 DeepSeek API 接入（扮演 ChatGPT）
- 📡 SSE 流式响应，打字机效果
- 👥 多用户多会话支持
- 🔄 实时在线状态同步

### 技术栈

- **前端**：原生 HTML / CSS / JavaScript
- **后端**：Node.js + Express + ws (WebSocket)
- **数据库**：MySQL
- **AI 模型**：DeepSeek API (deepseek-chat)
- **部署**：宝塔面板 + PM2 + Nginx

### 快速开始

#### 1. 安装依赖
```bash
npm install
```

#### 2. 配置环境变量
复制 `.env.example` 为 `.env` 并修改配置：
```bash
cp .env.example .env
```

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_db_name
DEEPSEEK_API_KEY=your_deepseek_api_key
PORT=3000
```

#### 3. 初始化数据库
导入 `init.sql` 到 MySQL 数据库。

#### 4. 启动服务
```bash
node server.js
```

#### 5. 访问
- 用户端：http://localhost:3000
- 管理后台：http://localhost:3000/admin.html

### 部署到宝塔

1. 上传项目文件到 `/www/wwwroot/fakeai`
2. 安装依赖：`npm install`
3. 配置 `.env` 文件
4. 导入数据库 `init.sql`
5. PM2 管理器添加项目，启动文件 `server.js`
6. 配置 Nginx 反向代理，开启 WebSocket 支持

### 项目结构

```
fakeai/
├── public/              # 前端静态文件
│   ├── index.html       # 用户端页面
│   ├── app.js           # 用户端逻辑
│   ├── style.css        # 用户端样式
│   ├── admin.html       # 管理后台页面
│   ├── admin.js         # 管理后台逻辑
│   └── admin.css        # 管理后台样式
├── server.js            # 后端服务
├── init.sql             # 数据库初始化脚本
├── package.json         # 项目配置
├── .env.example         # 环境变量模板
└── .gitignore           # Git 忽略文件
```

### 下载

- **客户端（用户端）**：ChatClient.zip - 用户使用的聊天界面
- **管理后台**：AdminPanel.zip - 管理员回复消息的后台

### License

MIT

---

## English

A simulated ChatGPT-style fake AI chat application that supports both manual admin replies and AI auto-reply modes.

### Features

#### Client (User Side)
- 🎨 ChatGPT-style UI with minimal white design
- 💬 Bubble chat interface, supports text and image messages
- ⏳ Thinking animation when waiting for reply
- ⌨️ Typewriter effect for AI replies, character by character
- 👤 Nickname system with local persistent storage
- 📝 Multi-conversation history management
- 🔄 Auto-reconnect on disconnect, message sync without loss
- 📱 Perfect mobile adaptation

#### Admin Panel
- 👥 Multi-user management, view all online users
- 💬 Real-time message push with new message notification sound
- 🤖 Choose AI auto-reply or manual reply for each message
- 🖼️ Support sending image messages
- 📱 Mobile portrait adaptation
- 🔔 New message sound alert

#### Backend
- ⚡ Node.js + Express + WebSocket
- 🗄️ MySQL database for persistent storage
- 🔌 DeepSeek API integration (impersonating ChatGPT)
- 📡 SSE streaming response with typewriter effect
- 👥 Multi-user, multi-conversation support
- 🔄 Real-time online status synchronization

### Tech Stack

- **Frontend**: Native HTML / CSS / JavaScript
- **Backend**: Node.js + Express + ws (WebSocket)
- **Database**: MySQL
- **AI Model**: DeepSeek API (deepseek-chat)
- **Deployment**: BT Panel + PM2 + Nginx

### Quick Start

#### 1. Install Dependencies
```bash
npm install
```

#### 2. Configure Environment Variables
Copy `.env.example` to `.env` and modify the configuration:
```bash
cp .env.example .env
```

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_db_name
DEEPSEEK_API_KEY=your_deepseek_api_key
PORT=3000
```

#### 3. Initialize Database
Import `init.sql` into your MySQL database.

#### 4. Start the Server
```bash
node server.js
```

#### 5. Access
- Client: http://localhost:3000
- Admin Panel: http://localhost:3000/admin.html

### Deploy to BT Panel

1. Upload project files to `/www/wwwroot/fakeai`
2. Install dependencies: `npm install`
3. Configure `.env` file
4. Import database `init.sql`
5. Add project in PM2 Manager, startup file `server.js`
6. Configure Nginx reverse proxy with WebSocket support

### Project Structure

```
fakeai/
├── public/              # Frontend static files
│   ├── index.html       # Client page
│   ├── app.js           # Client logic
│   ├── style.css        # Client styles
│   ├── admin.html       # Admin panel page
│   ├── admin.js         # Admin panel logic
│   └── admin.css        # Admin panel styles
├── server.js            # Backend service
├── init.sql             # Database init script
├── package.json         # Project config
├── .env.example         # Environment variables template
└── .gitignore           # Git ignore file
```

### Downloads

- **Chat Client**: ChatClient.zip - User-facing chat interface
- **Admin Panel**: AdminPanel.zip - Admin dashboard for replying to messages

### License

MIT
