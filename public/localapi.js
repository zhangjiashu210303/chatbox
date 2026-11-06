'use strict';

/**
 * 本地 API —— 让整个项目可以直接运行在 GitHub Pages（纯静态）上。
 *
 * 数据全部保存在浏览器 localStorage 中：
 *  - 账号、会话、消息、朋友圈都持久化
 *  - 多个标签页通过 BroadcastChannel 实时同步消息
 *  - 不同标签页可以登录不同账号，体验真正的“聊天”
 *
 * 注意：这是前端演示方案，数据不会跨设备同步。
 */
(function () {
  const DB_KEY = 'wx_static_db_v1';
  const PRESENCE_KEY = 'wx_static_presence_v1';
  const CHANNEL = 'wx_static_channel_v1';
  const ONLINE_TTL = 45000;

  const AVATARS = ['😀', '🐱', '🐶', '🦊', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐰', '🐻', '🌻', '🌈', '🍀', '🍉', '🍑', '🍓', '🍋', '🌙', '⭐', '🔥', '💧', '⚡'];
  const COLORS = ['#5b8def', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1'];

  let bus = null;
  try {
    if ('BroadcastChannel' in window) bus = new BroadcastChannel(CHANNEL);
  } catch {
    bus = null;
  }

  /* ---------------------------- 工具 ---------------------------- */

  const now = () => Date.now();
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function randHex(bytes) {
    const arr = new Uint8Array(bytes);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(arr);
    else for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function fail(status, message) {
    const e = new Error(message);
    e.status = status;
    return e;
  }

  function clean(value, max) {
    if (typeof value !== 'string') return '';
    return value.replace(/\u0000/g, '').trim().slice(0, max);
  }

  function post(payload) {
    try {
      if (bus) bus.postMessage(payload);
    } catch {
      /* ignore */
    }
  }

  /* ---------------------------- 密码 ---------------------------- */

  const encoder = new TextEncoder();

  async function hashPassword(password, salt) {
    if (window.crypto && crypto.subtle) {
      try {
        const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' },
          key,
          256
        );
        return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch {
        /* 降级 */
      }
    }
    // 非安全上下文（例如 file://）的降级哈希，仅用于演示
    let h1 = 0x811c9dc5;
    let h2 = 0x1000193;
    const input = `${salt}:${password}`;
    for (let i = 0; i < input.length; i++) {
      const c = input.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }

  async function verifyPassword(password, user) {
    // 演示账号在极端降级环境下也能登录
    if (user.demo && password === '123456') return true;
    const hash = await hashPassword(password, user.salt);
    return hash === user.password;
  }

  /* ---------------------------- 在线状态 ---------------------------- */

  function readPresence() {
    try {
      return JSON.parse(localStorage.getItem(PRESENCE_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }

  function touchPresence(userId) {
    const map = readPresence();
    const t = now();
    if (map[userId] && t - map[userId] < 10000) return;
    map[userId] = t;
    for (const id of Object.keys(map)) {
      if (t - map[id] > 1000 * 60 * 10) delete map[id];
    }
    try {
      localStorage.setItem(PRESENCE_KEY, JSON.stringify(map));
    } catch {
      /* ignore */
    }
  }

  function onlineIds() {
    const map = readPresence();
    const t = now();
    return Object.keys(map).filter((id) => t - map[id] < ONLINE_TTL);
  }

  /* ---------------------------- 数据 ---------------------------- */

  function seed() {
    const t = now();
    const demoUsers = [
      {
        id: randHex(8),
        username: 'xiaoming',
        nickname: '小明',
        avatar: '🐱',
        color: '#5b8def',
        signature: '今天也要元气满满！',
        salt: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
        password: '447699188107b8d71af481d4d87f123c7a7ab686b235bc23c5dcaac8cd797ff8',
        demo: true,
        createdAt: t - 86400000 * 30,
      },
      {
        id: randHex(8),
        username: 'xiaohong',
        nickname: '小红',
        avatar: '🌻',
        color: '#ec4899',
        signature: '人间烟火气，最抚凡人心。',
        salt: 'b1c2d3e4f5061728394a5b6c7d8e9f01',
        password: '8d34f0235e2cb9e5161e79f3b264dddc89ae9f09b5b7044d3ec3728d7218ee48',
        demo: true,
        createdAt: t - 86400000 * 28,
      },
      {
        id: randHex(8),
        username: 'ajie',
        nickname: '阿杰',
        avatar: '🦊',
        color: '#f59e0b',
        signature: '写代码，也写生活。',
        salt: 'c1d2e3f405162738495a6b7c8d9e0f12',
        password: '804986e390c0302cafad18a64bf0a1d20c6072f79850f7dba5abb049e9bdf235',
        demo: true,
        createdAt: t - 86400000 * 26,
      },
    ];

    const [xiaoming, xiaohong, ajie] = demoUsers;

    const chat1 = {
      id: randHex(8),
      type: 'direct',
      members: [xiaoming.id, xiaohong.id],
      createdAt: t - 3600000 * 26,
      lastMessageAt: t - 3600000 * 2,
      reads: { [xiaoming.id]: t - 3600000 * 2, [xiaohong.id]: t - 3600000 * 3 },
    };
    const chat2 = {
      id: randHex(8),
      type: 'group',
      members: [xiaoming.id, xiaohong.id, ajie.id],
      name: '产品交流群',
      avatar: '👥',
      color: '#10b981',
      owner: xiaoming.id,
      createdAt: t - 3600000 * 50,
      lastMessageAt: t - 3600000 * 5,
      reads: { [xiaoming.id]: t - 3600000 * 5, [xiaohong.id]: t - 3600000 * 5, [ajie.id]: t - 3600000 * 6 },
    };

    const messages = [
      { id: randHex(8), chatId: chat1.id, senderId: xiaoming.id, type: 'text', content: '小红，周末有空吗？想约你去看展。', createdAt: t - 3600000 * 6 },
      { id: randHex(8), chatId: chat1.id, senderId: xiaohong.id, type: 'text', content: '有空呀！是那个光影艺术展吗？我种草好久了 😆', createdAt: t - 3600000 * 5 },
      { id: randHex(8), chatId: chat1.id, senderId: xiaoming.id, type: 'text', content: '对，就是它。票我已经买好啦，周六下午两点。', createdAt: t - 3600000 * 4 },
      { id: randHex(8), chatId: chat1.id, senderId: xiaohong.id, type: 'text', content: '好耶！那到时候见～', createdAt: t - 3600000 * 2 },
      { id: randHex(8), chatId: chat2.id, senderId: ajie.id, type: 'text', content: '新版首页的设计稿我放到群里了，大家有空看一下。', createdAt: t - 3600000 * 8 },
      { id: randHex(8), chatId: chat2.id, senderId: xiaohong.id, type: 'text', content: '收到，配色我很喜欢，尤其是那个绿色。', createdAt: t - 3600000 * 7 },
      { id: randHex(8), chatId: chat2.id, senderId: xiaoming.id, type: 'text', content: '细节再对一轮就可以开发了，辛苦阿杰！', createdAt: t - 3600000 * 5 },
    ];

    const moments = [
      {
        id: randHex(8),
        userId: xiaohong.id,
        content: '今天的晚霞是橘子味的 🍊',
        createdAt: t - 3600000 * 3,
        likes: [xiaoming.id],
        comments: [{ id: randHex(8), userId: xiaoming.id, content: '拍得真好看！', createdAt: t - 3600000 * 2 }],
      },
      {
        id: randHex(8),
        userId: ajie.id,
        content: '新项目终于上线，感谢每一位并肩作战的伙伴。',
        createdAt: t - 3600000 * 20,
        likes: [xiaoming.id, xiaohong.id],
        comments: [],
      },
    ];

    return { users: demoUsers, sessions: [], chats: [chat1, chat2], messages, moments };
  }

  function loadDB() {
    let raw = null;
    try {
      raw = localStorage.getItem(DB_KEY);
    } catch {
      /* ignore */
    }
    if (raw) {
      try {
        const db = JSON.parse(raw);
        if (db && Array.isArray(db.users)) {
          db.sessions ||= [];
          db.chats ||= [];
          db.messages ||= [];
          db.moments ||= [];
          return db;
        }
      } catch {
        /* 损坏则重建 */
      }
    }
    const db = seed();
    persist(db);
    return db;
  }

  function persist(db) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch {
      throw fail(507, '浏览器存储空间已满，请清理部分图片消息后重试');
    }
  }

  function userById(db, id) {
    return db.users.find((u) => u.id === id);
  }

  function publicUser(user, online) {
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      color: user.color,
      signature: user.signature,
      createdAt: user.createdAt,
      online: online ? online.has(user.id) : onlineIds().includes(user.id),
    };
  }

  function chatMessages(db, chatId) {
    return db.messages.filter((m) => m.chatId === chatId);
  }

  function summarizeChat(db, chat, userId) {
    const online = new Set(onlineIds());
    const members = chat.members.map((id) => userById(db, id)).filter(Boolean);
    const msgs = chatMessages(db, chat.id);
    const last = msgs[msgs.length - 1];

    let name = chat.name;
    let avatar = chat.avatar;
    let color = chat.color;
    let peer = null;

    if (chat.type === 'direct') {
      peer = members.find((u) => u.id !== userId) || members[0] || null;
      name = peer ? peer.nickname : '未知用户';
      avatar = peer ? peer.avatar : '👤';
      color = peer ? peer.color : '#9ca3af';
    }

    const readAt = (chat.reads && chat.reads[userId]) || 0;
    const unread = msgs.filter((m) => m.createdAt > readAt && m.senderId !== userId).length;

    return {
      id: chat.id,
      type: chat.type,
      name,
      avatar,
      color,
      owner: chat.owner || null,
      memberCount: chat.members.length,
      members: members.map((u) => publicUser(u, online)),
      peer: peer ? publicUser(peer, online) : null,
      unread,
      updatedAt: last ? last.createdAt : chat.createdAt,
      lastMessage: last
        ? {
            id: last.id,
            type: last.type,
            content: last.type === 'image' ? '[图片]' : last.content,
            senderId: last.senderId,
            senderName: userById(db, last.senderId)?.nickname || '',
            createdAt: last.createdAt,
          }
        : null,
    };
  }

  function momentView(db, moment, userId) {
    const online = new Set(onlineIds());
    const author = userById(db, moment.userId);
    return {
      id: moment.id,
      content: moment.content,
      createdAt: moment.createdAt,
      author: author ? publicUser(author, online) : { nickname: '已注销用户', avatar: '👤', color: '#9ca3af' },
      likes: moment.likes.map((id) => userById(db, id)?.nickname).filter(Boolean),
      likedByMe: moment.likes.includes(userId),
      comments: moment.comments.map((c) => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt,
        author: userById(db, c.userId)?.nickname || '已注销用户',
      })),
    };
  }

  function newSession(db, userId) {
    const token = randHex(32);
    db.sessions.push({ token, userId, createdAt: now() });
    db.sessions = db.sessions.filter((s) => now() - s.createdAt < 1000 * 60 * 60 * 24 * 30);
    return token;
  }

  function requireAuth(db, token) {
    const session = db.sessions.find((s) => s.token === token);
    if (!session) throw fail(401, '登录状态已失效，请重新登录');
    const user = userById(db, session.userId);
    if (!user) throw fail(401, '登录状态已失效，请重新登录');
    if (now() - session.createdAt > 1000 * 60 * 60 * 24 * 30) throw fail(401, '登录已过期，请重新登录');
    touchPresence(user.id);
    return user;
  }

  /* ---------------------------- 图片处理 ---------------------------- */

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(fail(400, '图片解析失败'));
      img.src = src;
    });
  }

  async function processImage(dataUrl) {
    const match = /^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
    if (!match) throw fail(400, '仅支持 png / jpg / gif / webp 图片');
    const type = match[1];
    const bytes = Math.floor((match[2].length * 3) / 4);
    if (bytes > 5 * 1024 * 1024) throw fail(400, '图片不能超过 5MB');

    if (type === 'gif') {
      if (bytes > 1.2 * 1024 * 1024) throw fail(400, 'GIF 图片请控制在 1.2MB 以内');
      return dataUrl;
    }

    const img = await loadImage(dataUrl);
    const maxSide = 1200;
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    let out = canvas.toDataURL('image/jpeg', 0.8);
    if (out.length > dataUrl.length) out = dataUrl;
    if (out.length > 1.8 * 1024 * 1024) throw fail(400, '图片压缩后仍然过大，请换一张试试');
    return out;
  }

  /* ---------------------------- 请求路由 ---------------------------- */

  async function request(path, { method = 'GET', body = {}, token = '' } = {}) {
    const url = new URL(path, window.location.origin);
    const pathname = url.pathname;
    const db = loadDB();

    /* 健康检查 */
    if (pathname === '/api/health') {
      return { ok: true, mode: 'static', users: db.users.length, time: now() };
    }

    /* 注册 */
    if (pathname === '/api/register' && method === 'POST') {
      const username = clean(body.username, 20);
      const nickname = clean(body.nickname, 20) || username;
      const password = typeof body.password === 'string' ? body.password : '';

      if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/.test(username)) throw fail(400, '账号需为 2-20 位字母、数字、下划线或中文');
      if (!nickname) throw fail(400, '昵称不能为空');
      if (password.length < 6) throw fail(400, '密码至少 6 位');
      if (password.length > 64) throw fail(400, '密码过长');
      if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) throw fail(409, '该账号已被注册');

      const salt = randHex(16);
      const hash = await hashPassword(password, salt);
      const user = {
        id: randHex(8),
        username,
        nickname,
        salt,
        password: hash,
        avatar: clean(body.avatar, 8) || pick(AVATARS),
        color: /^#[0-9a-fA-F]{6}$/.test(body.color || '') ? body.color : pick(COLORS),
        signature: '这个人很懒，什么都没留下。',
        createdAt: now(),
      };
      db.users.push(user);
      const sessionToken = newSession(db, user.id);
      persist(db);
      touchPresence(user.id);

      post({ type: 'user:joined', user: publicUser(user) });
      return { token: sessionToken, user: publicUser(user) };
    }

    /* 登录 */
    if (pathname === '/api/login' && method === 'POST') {
      const username = clean(body.username, 20);
      const password = typeof body.password === 'string' ? body.password : '';
      const user = db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
      if (!user) throw fail(401, '账号或密码错误');
      const ok = await verifyPassword(password, user);
      if (!ok) throw fail(401, '账号或密码错误');

      const sessionToken = newSession(db, user.id);
      persist(db);
      touchPresence(user.id);
      return { token: sessionToken, user: publicUser(user) };
    }

    /* 以下需要登录 */
    const me = requireAuth(db, token);

    if (pathname === '/api/logout' && method === 'POST') {
      db.sessions = db.sessions.filter((s) => s.token !== token);
      persist(db);
      return { ok: true };
    }

    if (pathname === '/api/me' && method === 'GET') {
      return { user: publicUser(me), online: onlineIds() };
    }

    if (pathname === '/api/me' && method === 'PATCH') {
      if (body.nickname !== undefined) {
        const nickname = clean(body.nickname, 20);
        if (!nickname) throw fail(400, '昵称不能为空');
        me.nickname = nickname;
      }
      if (body.signature !== undefined) me.signature = clean(body.signature, 50);
      if (body.avatar !== undefined) {
        const avatar = clean(body.avatar, 8);
        if (avatar) me.avatar = avatar;
      }
      if (body.color !== undefined && /^#[0-9a-fA-F]{6}$/.test(body.color)) me.color = body.color;
      persist(db);

      const pub = publicUser(me);
      post({ type: 'user:update', user: pub });
      return { user: pub };
    }

    if (pathname === '/api/users' && method === 'GET') {
      const online = new Set(onlineIds());
      const users = db.users
        .filter((u) => u.id !== me.id)
        .map((u) => publicUser(u, online))
        .sort((a, b) => a.nickname.localeCompare(b.nickname, 'zh-CN'));
      return { users };
    }

    if (pathname === '/api/chats' && method === 'GET') {
      const chats = db.chats
        .filter((c) => c.members.includes(me.id))
        .map((c) => summarizeChat(db, c, me.id))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      return { chats };
    }

    if (pathname === '/api/chats/direct' && method === 'POST') {
      const target = userById(db, body.userId);
      if (!target || target.id === me.id) throw fail(400, '用户不存在');

      let chat = db.chats.find(
        (c) =>
          c.type === 'direct' &&
          c.members.length === 2 &&
          c.members.includes(me.id) &&
          c.members.includes(target.id)
      );
      let created = false;
      if (!chat) {
        chat = {
          id: randHex(8),
          type: 'direct',
          members: [me.id, target.id],
          createdAt: now(),
          lastMessageAt: now(),
          reads: { [me.id]: now() },
        };
        db.chats.push(chat);
        persist(db);
        created = true;
      }
      if (created) {
        post({ type: 'chat:new', for: target.id, chat: summarizeChat(db, chat, target.id) });
      }
      return { chat: summarizeChat(db, chat, me.id) };
    }

    if (pathname === '/api/chats/group' && method === 'POST') {
      const memberIds = Array.isArray(body.memberIds) ? body.memberIds.filter((x) => typeof x === 'string') : [];
      const unique = [...new Set(memberIds)].filter((id) => id !== me.id && userById(db, id));
      if (!unique.length) throw fail(400, '请至少选择一位联系人');

      const members = [me.id, ...unique];
      const defaultName = members
        .map((id) => userById(db, id)?.nickname || '')
        .filter(Boolean)
        .join('、')
        .slice(0, 20);

      const chat = {
        id: randHex(8),
        type: 'group',
        members,
        name: clean(body.name, 20) || defaultName,
        avatar: '👥',
        color: '#10b981',
        owner: me.id,
        createdAt: now(),
        lastMessageAt: now(),
        reads: { [me.id]: now() },
      };
      db.chats.push(chat);
      persist(db);

      for (const id of members) {
        if (id === me.id) continue;
        post({ type: 'chat:new', for: id, chat: summarizeChat(db, chat, id) });
      }
      return { chat: summarizeChat(db, chat, me.id) };
    }

    /* 会话相关 */
    const chatMatch = pathname.match(/^\/api\/chats\/([a-f0-9]+)(\/[a-z]+)?$/);
    if (chatMatch) {
      const chat = db.chats.find((c) => c.id === chatMatch[1]);
      if (!chat || !chat.members.includes(me.id)) throw fail(404, '会话不存在');
      const action = chatMatch[2] || '';

      if (action === '/messages' && method === 'GET') {
        const all = chatMessages(db, chat.id);
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 300);
        const before = Number(url.searchParams.get('before')) || 0;
        const filtered = before ? all.filter((m) => m.createdAt < before) : all;
        const slice = filtered.slice(-limit);
        const online = new Set(onlineIds());

        return {
          chat: summarizeChat(db, chat, me.id),
          messages: slice.map((m) => ({ ...m, sender: publicUser(userById(db, m.senderId), online) })),
          hasMore: filtered.length > slice.length,
        };
      }

      if (action === '/messages' && method === 'POST') {
        const type = body.type === 'image' ? 'image' : 'text';
        const content = clean(body.content, type === 'image' ? 4 * 1024 * 1024 : 2000);
        if (!content) throw fail(400, '消息不能为空');
        if (type === 'image' && !/^data:image\/(png|jpe?g|gif|webp);base64,/.test(content)) {
          throw fail(400, '图片数据无效');
        }

        const message = { id: randHex(8), chatId: chat.id, senderId: me.id, type, content, createdAt: now() };
        db.messages.push(message);
        chat.lastMessageAt = message.createdAt;
        chat.reads[me.id] = message.createdAt;
        persist(db);

        const sender = publicUser(me);
        for (const memberId of chat.members) {
          post({
            type: 'message',
            for: memberId,
            chat: summarizeChat(db, chat, memberId),
            message: { ...message, sender },
          });
        }
        return { message: { ...message, sender } };
      }

      if (action === '/read' && method === 'POST') {
        chat.reads[me.id] = now();
        persist(db);
        return { ok: true };
      }
    }

    /* 图片上传：压缩后以 data URL 形式返回 */
    if (pathname === '/api/upload' && method === 'POST') {
      const url2 = await processImage(body.data);
      return { url: url2 };
    }

    /* 朋友圈 */
    if (pathname === '/api/moments' && method === 'GET') {
      const moments = [...db.moments].sort((a, b) => b.createdAt - a.createdAt).map((m) => momentView(db, m, me.id));
      return { moments };
    }

    if (pathname === '/api/moments' && method === 'POST') {
      const content = clean(body.content, 500);
      if (!content) throw fail(400, '内容不能为空');
      const moment = { id: randHex(8), userId: me.id, content, createdAt: now(), likes: [], comments: [] };
      db.moments.push(moment);
      persist(db);
      post({ type: 'moment:new', moment: momentView(db, moment, me.id) });
      return { moment: momentView(db, moment, me.id) };
    }

    const likeMatch = pathname.match(/^\/api\/moments\/([a-f0-9]+)\/like$/);
    if (likeMatch && method === 'POST') {
      const moment = db.moments.find((m) => m.id === likeMatch[1]);
      if (!moment) throw fail(404, '内容不存在');
      if (moment.likes.includes(me.id)) moment.likes = moment.likes.filter((id) => id !== me.id);
      else moment.likes.push(me.id);
      persist(db);
      return {
        likes: moment.likes.map((id) => userById(db, id)?.nickname).filter(Boolean),
        likedByMe: moment.likes.includes(me.id),
      };
    }

    const commentMatch = pathname.match(/^\/api\/moments\/([a-f0-9]+)\/comment$/);
    if (commentMatch && method === 'POST') {
      const moment = db.moments.find((m) => m.id === commentMatch[1]);
      if (!moment) throw fail(404, '内容不存在');
      const content = clean(body.content, 200);
      if (!content) throw fail(400, '评论不能为空');
      const comment = { id: randHex(8), userId: me.id, content, createdAt: now() };
      moment.comments.push(comment);
      persist(db);
      return { comment: { ...comment, author: me.nickname } };
    }

    throw fail(404, '接口不存在');
  }

  /* ---------------------------- 订阅实时事件 ---------------------------- */

  function subscribe(handler) {
    if (!bus) return () => {};
    const listener = (event) => {
      try {
        handler(event.data);
      } catch {
        /* ignore */
      }
    };
    bus.addEventListener('message', listener);
    return () => bus.removeEventListener('message', listener);
  }

  function resetAll() {
    try {
      localStorage.removeItem(DB_KEY);
      localStorage.removeItem(PRESENCE_KEY);
    } catch {
      /* ignore */
    }
  }

  window.LocalAPI = { request, subscribe, onlineIds, resetAll, mode: 'static' };
})();
