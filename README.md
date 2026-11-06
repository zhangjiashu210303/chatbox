# 微信网页版（纯静态）

一个**类微信**的网页聊天应用，使用原生 HTML / CSS / JavaScript 编写，**零依赖、纯静态**，可以直接部署到 **GitHub Pages**。

> 在线体验：把本仓库部署到 GitHub Pages 后即可打开。

## ✨ 功能

- 👤 **注册 / 登录**：账号密码使用 PBKDF2 加密后保存在浏览器中
- 💬 **单聊**：从通讯录选择好友，实时收发消息
- 👥 **群聊**：选择多位联系人创建群聊，支持群昵称发送者展示
- 🌿 **朋友圈**：发布动态、点赞、评论
- 🖼 **图片消息**：自动压缩后发送，点击可放大预览
- 😊 **表情面板**、消息未读数、在线状态、会话搜索
- 📱 **响应式布局**：桌面端三栏，手机端底部导航 + 全屏聊天
- 🔄 **多标签页实时同步**：通过 `BroadcastChannel` 即时推送新消息
- 🎨 **个人资料**：修改头像、头像底色、昵称、个性签名

## 🚀 部署到 GitHub Pages

### 方式一：GitHub Actions（推荐，仓库已内置工作流）

1. 把代码推送到仓库的 `main` 分支：
   ```bash
   git remote add origin https://github.com/zhangjiashu210303/chatbox.git
   git branch -M main
   git push -u origin main
   ```
2. 打开仓库 **Settings → Pages**，将 **Build and deployment → Source** 设为 **GitHub Actions**
3. 推送后会自动运行 `Deploy to GitHub Pages` 工作流
4. 部署完成后访问：`https://zhangjiashu210303.github.io/chatbox/`

> `.github/workflows/deploy.yml` 会发布 `public/` 目录。

### 方式二：从分支发布

在 **Settings → Pages** 中选择 **Deploy from a branch**，分支选 `main`，目录选 `/public` 即可。

## 💻 本地运行

```bash
npm start
# 或
node preview.js
```

打开 <http://localhost:3000>。

也可以使用任意静态服务器，例如：

```bash
npx serve public
```

> 请通过 `http://localhost` 或 `https://` 访问，这样浏览器才会启用 Web Crypto（密码加密）。直接双击 `index.html` 也能打开，但会降级为简单哈希。

## 🧪 演示账号

| 账号 | 密码 |
| --- | --- |
| `xiaoming` | `123456` |
| `xiaohong` | `123456` |
| `ajie` | `123456` |

也可以直接注册新账号。

### 体验两个账号实时聊天

1. 在标签页 A 登录 `xiaoming`
2. **新开一个标签页** B（不要复制标签页），登录 `xiaohong`
3. 在任意一边发消息，另一边会实时收到

> 登录状态保存在 `sessionStorage`，所以同浏览器的不同标签页可以分别登录不同账号。

## 📦 项目结构

```
chatbox/
├── public/                 # 静态站点（GitHub Pages 发布目录）
│   ├── index.html
│   ├── style.css
│   ├── app.js              # 页面交互逻辑
│   └── localapi.js         # 本地 API：账号、消息、朋友圈
├── preview.js              # 本地预览用静态服务器（无需依赖）
├── .github/workflows/      # GitHub Pages 自动部署
└── package.json
```

## 🔐 数据说明

- 所有数据保存在浏览器的 **localStorage** 中（键名 `wx_static_db_v1`），不会上传到任何服务器。
- 图片会先压缩再以 data URL 形式保存，浏览器存储空间通常为 5MB 左右，请勿大量发送图片。
- 清除浏览器数据会同时清除账号和聊天记录。
- 换浏览器 / 换设备不会同步数据。

## ⚠️ 说明

这是一个前端演示项目：**账号与聊天数据只存在于当前浏览器**。如果需要真正跨设备、多人实时聊天，需要接入后端或云数据库（例如 Supabase、Firebase、自建 Node.js + WebSocket 服务）。

## 📄 License

MIT
