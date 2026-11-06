# ChatBox

一个**类微信**的网页聊天应用，使用原生 HTML / CSS / JavaScript 编写，**零依赖、纯静态**，可以直接部署到 **GitHub Pages**。

> 在线体验：<https://zhangjiashu210303.github.io/chatbox/>

## ✨ 特点

- ☁️ **真实云端互动**：账号、聊天、朋友圈全部存储在 **GitHub Issues** 中，换设备、换浏览器也能继续聊
- 👤 **注册 / 登录**：密码使用 PBKDF2 加盐哈希后保存
- 💬 **单聊**：从通讯录选择好友，消息以 Issue 评论的形式实时同步
- 👥 **群聊**：选择多位联系人创建群聊
- 🌿 **朋友圈**：发布动态、点赞、评论
- 😊 **表情面板**、未读数、会话搜索、在线状态
- 📱 **响应式布局**：桌面端三栏，手机端底部导航 + 全屏聊天
- 🔄 **自动刷新**：每 6 秒通过带 ETag 的 GitHub API 轮询，有新内容时自动更新

## 🚀 部署到 GitHub Pages

仓库已内置 GitHub Actions 工作流，推送到 `main` 即可自动发布 `public/`：

1. 打开仓库 **Settings → Pages**，将 **Build and deployment → Source** 设为 **GitHub Actions**
2. 推送到 `main` 分支
3. 等待 `Deploy to GitHub Pages` 工作流完成
4. 访问 `https://zhangjiashu210303.github.io/chatbox/`

## 💻 本地运行

```bash
npm start
# 或
node preview.js
```

打开 <http://localhost:3000>。

## 🧪 演示账号

| 账号 | 密码 |
| --- | --- |
| `xiaoming` | `123456` |
| `xiaohong` | `123456` |
| `ajie` | `123456` |

也可以直接注册新账号。注册后换一台设备登录同一账号，就能看到相同的聊天记录。

## ☁️ 数据是怎么存的

所有数据都放在本仓库的 GitHub Issues 里：

| 数据 | 存储方式 |
| --- | --- |
| 账号注册表 | 标题为 `[ChatBox] registry` 的 Issue |
| 聊天会话 | 标题为 `[ChatBox] chat:<id>` 的 Issue，成员、群名等保存在 body |
| 聊天消息 | 对应聊天 Issue 的评论 |
| 朋友圈 | 标题为 `[ChatBox] moment:<id>` 的 Issue，点赞和评论保存在 body |

前端通过 GitHub REST API 读写 Issues，并使用 ETag 条件请求减少流量与配额消耗。

## ⚠️ 重要说明

- 这是一个**公开仓库**，GitHub Issues 的内容默认**公开可见**，请不要发送敏感信息。
- 前端内置了一个只具备 **Issues 读写** 权限的 GitHub PAT，因此任何打开页面的人都能读写仓库的 Issues。这适合演示和轻量使用，不适合正式生产环境。
- 云端模式**暂不支持图片消息**（GitHub Issue 评论长度有限）。
- 若 GitHub API 触发限流，稍等片刻即可恢复。

## 📦 项目结构

```
chatbox/
├── public/                 # 静态站点（GitHub Pages 发布目录）
│   ├── index.html
│   ├── style.css
│   ├── app.js              # 页面交互逻辑
│   ├── cloud.js            # GitHub Issues 云端后端
│   └── localapi.js         # 本地 localStorage 后端（作为离线降级）
├── preview.js              # 本地预览用静态服务器（无需依赖）
├── .github/workflows/      # GitHub Pages 自动部署
└── package.json
```

## 📄 License

MIT
