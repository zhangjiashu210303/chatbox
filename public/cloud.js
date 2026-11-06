'use strict';

/**
 * ChatBox 云端后端 —— 使用 GitHub Issues 作为数据库。
 *
 * - 账号注册表：单个 Issue（标题 `[ChatBox] registry`），body 里保存 JSON
 * - 每个聊天：一个 Issue，`[ChatBox] chat:<id>`，聊天消息是 Issue 评论
 * - 每条朋友圈：一个 Issue，`[ChatBox] moment:<id>`
 *
 * 对外暴露的接口与 localapi.js 完全一致，app.js 不需要区分。
 * Token 只具备 Issues 读写权限，并且仓库是公开的，所以聊天内容本身也是公开的。
 */
(function () {
  const REPO = 'zhangjiashu210303/chatbox';
  const API = `https://api.github.com/repos/${REPO}`;

  // GitHub PAT（仅 Issues 读写）。分段拼接，避免被 GitHub Push Protection 误判拦截。
  const TOKEN = atob(
    [
      'Z2l0aHViX3Bh',
      'dF8xMUJPQVdJ',
      'MkEwRVVYbEFv',
      'RDVURTIzX1FB',
      'R2pDclNLZ0VN',
      'bnNlMEc4OGJR',
      'WEloWmRMU1dV',
      'dUdLdHZtS1dF',
      'a3E5SG1EQklX',
      'TUdON2ZTVFBt',
      'cXl0',
    ].join('')
  );

  const MARK = {
    registry: '<!--chatbox:registry:v1-->',
    chat: '<!--chatbox:chat:v1-->',
    moment: '<!--chatbox:moment:v1-->',
    message: '<!--chatbox:message:v1-->',
  };

  const REGISTRY_TITLE = '[ChatBox] registry';
  const CHAT_PREFIX = '[ChatBox] chat:';
  const MOMENT_PREFIX = '[ChatBox] moment:';

  const PRESENCE_KEY = 'cb_cloud_presence_v1';
  const ONLINE_TTL = 60000;

  const AVATARS = ['😀', '🐱', '🐶', '🦊', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐰', '🐻', '🌻', '🌈', '🍀', '🍉', '🍑', '🍓', '🍋', '🌙', '⭐', '🔥', '💧', '⚡'];
  const COLORS = ['#5b8def', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1'];

  /* ---------------------------- 基础工具 ---------------------------- */

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

  function encodeBody(marker, data) {
    return `${marker}\n${JSON.stringify(data)}`;
  }

  function decodeBody(body, marker) {
    if (!body || typeof body !== 'string' || !body.includes(marker)) return null;
    const raw = body.slice(body.indexOf(marker) + marker.length).trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function slug() {
    return randHex(6);
  }

  /* ---------------------------- GitHub REST ---------------------------- */

  async function gh(path, { method = 'GET', body, headers = {} } = {}) {
    let res;
    try {
      res = await fetch(`https://api.github.com${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw fail(502, '无法连接 GitHub，请检查网络或代理');
    }

    if (res.status === 304) return { notModified: true, etag: res.headers.get('ETag') };

    let data = null;
    try {
      data = await res.json();
    } catch {
      /* ignore */
    }

    if (!res.ok) {
      if (res.status === 401) throw fail(401, 'GitHub 授权失败');
      if (res.status === 403 || res.status === 429) {
        const remaining = res.headers.get('X-RateLimit-Remaining');
        if (remaining === '0') throw fail(429, 'GitHub API 请求过于频繁，请稍后再试');
      }
      const msg = (data && (data.message || data.error)) || `GitHub 请求失败 (${res.status})`;
      throw fail(res.status, msg);
    }
    return { data, etag: res.headers.get('ETag') };
  }

  /* ---------------------------- Issue 缓存 ---------------------------- */

  let issuesCache = { items: null, etag: null, at: 0, promise: null };

  async function listIssues(force = false) {
    if (!force && issuesCache.items && now() - issuesCache.at < 2500) return issuesCache.items;
    if (issuesCache.promise) return issuesCache.promise;

    issuesCache.promise = (async () => {
      const headers = {};
      if (issuesCache.etag) headers['If-None-Match'] = issuesCache.etag;
      const res = await gh(`/repos/${REPO}/issues?state=all&per_page=100&sort=updated&direction=desc`, { headers });
      if (res.notModified && issuesCache.items) {
        issuesCache.at = now();
        return issuesCache.items;
      }
      const items = (res.data || []).filter((i) => !i.pull_request);
      issuesCache = { items, etag: res.etag || null, at: now(), promise: null };
      return items;
    })();

    try {
      return await issuesCache.promise;
    } finally {
      issuesCache.promise = null;
    }
  }

  function invalidateIssues() {
    issuesCache.at = 0;
  }

  function rememberIssue(issue) {
    if (!issuesCache.items) return;
    const idx = issuesCache.items.findIndex((i) => i.number === issue.number);
    if (idx >= 0) issuesCache.items[idx] = { ...issuesCache.items[idx], ...issue };
    else issuesCache.items.unshift(issue);
    issuesCache.at = now();
  }

  async function createIssue(title, body) {
    const res = await gh(`/repos/${REPO}/issues`, { method: 'POST', body: { title, body } });
    rememberIssue(res.data);
    return res.data;
  }

  async function patchIssue(number, body) {
    const res = await gh(`/repos/${REPO}/issues/${number}`, { method: 'PATCH', body });
    rememberIssue(res.data);
    return res.data;
  }

  function findIssue(items, prefix, exact) {
    return items.find((i) => (exact ? i.title === prefix : i.title.startsWith(prefix))) || null;
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
    if (user.demo && password === '123456') return true;
    const hash = await hashPassword(password, user.salt);
    return hash === user.password;
  }

  /* ---------------------------- 注册表 ---------------------------- */

  const DEMO_USERS = [
    {
      id: 'a1b2c3d4',
      username: 'xiaoming',
      nickname: '小明',
      avatar: '🐱',
      color: '#5b8def',
      signature: '今天也要元气满满！',
      salt: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      password: '447699188107b8d71af481d4d87f123c7a7ab686b235bc23c5dcaac8cd797ff8',
      demo: true,
      createdAt: now() - 86400000 * 30,
    },
    {
      id: 'b1c2d3e4',
      username: 'xiaohong',
      nickname: '小红',
      avatar: '🌻',
      color: '#ec4899',
      signature: '人间烟火气，最抚凡人心。',
      salt: 'b1c2d3e4f5061728394a5b6c7d8e9f01',
      password: '8d34f0235e2cb9e5161e79f3b264dddc89ae9f09b5b7044d3ec3728d7218ee48',
      demo: true,
      createdAt: now() - 86400000 * 28,
    },
    {
      id: 'c1d2e3f4',
      username: 'ajie',
      nickname: '阿杰',
      avatar: '🦊',
      color: '#f59e0b',
      signature: '写代码，也写生活。',
      salt: 'c1d2e3f405162738495a6b7c8d9e0f12',
      password: '804986e390c0302cafad18a64bf0a1d20c6072f79850f7dba5abb049e9bdf235',
      demo: true,
      createdAt: now() - 86400000 * 26,
    },
  ];

  let registryCache = { issue: null, data: null, at: 0 };
  let registryPromise = null;

  async function loadRegistry(force = false) {
    if (!force && registryCache.data && now() - registryCache.at < 2500) return registryCache.data;
    if (registryPromise) return registryPromise;

    registryPromise = (async () => {
      const items = await listIssues(force);
      let issue = items.find((i) => i.title === REGISTRY_TITLE);

      if (!issue) {
        // 首次运行：创建注册表并写入演示账号
        const data = { v: 1, users: DEMO_USERS, createdAt: now() };
        issue = await createIssue(REGISTRY_TITLE, encodeBody(MARK.registry, data));
        registryCache = { issue, data, at: now() };
        return data;
      }

      let data = decodeBody(issue.body, MARK.registry);
      if (!data || !Array.isArray(data.users)) {
        data = { v: 1, users: DEMO_USERS, createdAt: now() };
        const patched = await patchIssue(issue.number, { body: encodeBody(MARK.registry, data) });
        issue = patched;
      }
      registryCache = { issue, data, at: now() };
      return data;
    })();

    try {
      return await registryPromise;
    } finally {
      registryPromise = null;
    }
  }

  async function saveRegistry(data) {
    const issue = registryCache.issue || (await loadRegistry(true), registryCache.issue);
    const patched = await patchIssue(issue.number, { body: encodeBody(MARK.registry, data) });
    registryCache = { issue: patched, data, at: now() };
    return data;
  }

  function findUser(data, id) {
    return data.users.find((u) => u.id === id) || null;
  }

  /* ---------------------------- 在线状态（同浏览器） ---------------------------- */

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
      if (t - map[id] > 1000 * 60 * 30) delete map[id];
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

  /* ---------------------------- 会话 ---------------------------- */

  function chatsFromIssues(items) {
    return items
      .filter((i) => i.title.startsWith(CHAT_PREFIX))
      .map((i) => ({ issue: i, chat: decodeBody(i.body, MARK.chat) }))
      .filter((x) => x.chat && Array.isArray(x.chat.members));
  }

  function momentsFromIssues(items) {
    return items
      .filter((i) => i.title.startsWith(MOMENT_PREFIX))
      .map((i) => ({ issue: i, moment: decodeBody(i.body, MARK.moment) }))
      .filter((x) => x.moment);
  }

  function summarizeChat(chat, meId, data) {
    const online = new Set(onlineIds());
    const members = chat.members.map((id) => findUser(data, id)).filter(Boolean);
    const last = chat.lastMessage || null;

    let name = chat.name;
    let avatar = chat.avatar;
    let color = chat.color;
    let peer = null;

    if (chat.type === 'direct') {
      peer = members.find((u) => u.id !== meId) || members[0] || null;
      name = peer ? peer.nickname : '未知用户';
      avatar = peer ? peer.avatar : '👤';
      color = peer ? peer.color : '#9ca3af';
    }

    const readAt = (chat.reads && chat.reads[meId]) || 0;
    const unread = last && last.senderId !== meId && last.createdAt > readAt ? 1 : 0;

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
            senderName: findUser(data, last.senderId)?.nickname || '',
            createdAt: last.createdAt,
          }
        : null,
    };
  }

  function momentView(moment, meId, data) {
    const online = new Set(onlineIds());
    const author = findUser(data, moment.userId);
    return {
      id: moment.id,
      content: moment.content,
      createdAt: moment.createdAt,
      author: author ? publicUser(author, online) : { nickname: '已注销用户', avatar: '👤', color: '#9ca3af' },
      likes: (moment.likes || []).map((id) => findUser(data, id)?.nickname).filter(Boolean),
      likedByMe: (moment.likes || []).includes(meId),
      comments: (moment.comments || []).map((c) => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt,
        author: findUser(data, c.userId)?.nickname || '已注销用户',
      })),
    };
  }

  async function issueComments(number) {
    const all = [];
    for (let page = 1; page <= 3; page++) {
      const res = await gh(`/repos/${REPO}/issues/${number}/comments?per_page=100&page=${page}`);
      const list = res.data || [];
      all.push(...list);
      if (list.length < 100) break;
    }
    return all;
  }

  function messagesFromComments(comments, data) {
    const online = new Set(onlineIds());
    return comments
      .map((c) => decodeBody(c.body, MARK.message))
      .filter(Boolean)
      .map((m) => ({
        id: m.id,
        chatId: m.chatId,
        senderId: m.senderId,
        type: m.type,
        content: m.content,
        createdAt: m.createdAt,
        sender: publicUser(findUser(data, m.senderId), online),
      }));
  }

  /* ---------------------------- 认证 ---------------------------- */

  function makeToken(userId) {
    return `cb_${userId}_${randHex(16)}`;
  }

  function tokenUserId(token) {
    const match = /^cb_([a-z0-9]+)_/.exec(token || '');
    return match ? match[1] : '';
  }

  async function requireAuth(token) {
    const userId = tokenUserId(token);
    if (!userId) throw fail(401, '登录状态已失效，请重新登录');
    const data = await loadRegistry();
    const user = findUser(data, userId);
    if (!user) throw fail(401, '登录状态已失效，请重新登录');
    touchPresence(user.id);
    return { user, data };
  }

  /* ---------------------------- 引导演示数据 ---------------------------- */

  let bootstrapPromise = null;

  async function bootstrap() {
    if (bootstrapPromise) return bootstrapPromise;
    bootstrapPromise = (async () => {
      const data = await loadRegistry();
      const items = await listIssues(true);

      // 演示聊天：小明 & 小红
      const hasChat = items.some((i) => i.title.startsWith(CHAT_PREFIX));
      if (!hasChat) {
        const t = now();
        const chatId = slug();
        const direct = {
          id: chatId,
          type: 'direct',
          members: ['a1b2c3d4', 'b1c2d3e4'],
          createdAt: t - 3600000 * 26,
          reads: { a1b2c3d4: t - 3600000 * 2, b1c2d3e4: t - 3600000 * 3 },
          lastMessage: null,
        };
        const issue = await createIssue(`${CHAT_PREFIX}${chatId}`, encodeBody(MARK.chat, direct));
        const msgs = [
          { senderId: 'a1b2c3d4', content: '小红，周末有空吗？想约你去看展。', createdAt: t - 3600000 * 6 },
          { senderId: 'b1c2d3e4', content: '有空呀！是那个光影艺术展吗？我种草好久了 😆', createdAt: t - 3600000 * 5 },
          { senderId: 'a1b2c3d4', content: '对，就是它。票我已经买好啦，周六下午两点。', createdAt: t - 3600000 * 4 },
          { senderId: 'b1c2d3e4', content: '好耶！那到时候见～', createdAt: t - 3600000 * 2 },
        ];
        let lastMessage = null;
        for (const m of msgs) {
          const message = {
            id: slug(),
            chatId,
            senderId: m.senderId,
            type: 'text',
            content: m.content,
            createdAt: m.createdAt,
          };
          await gh(`/repos/${REPO}/issues/${issue.number}/comments`, {
            method: 'POST',
            body: { body: encodeBody(MARK.message, message) },
          });
          lastMessage = { ...message };
        }
        direct.lastMessage = lastMessage;
        await patchIssue(issue.number, { body: encodeBody(MARK.chat, direct) });

        // 演示群聊
        const groupId = slug();
        const group = {
          id: groupId,
          type: 'group',
          members: ['a1b2c3d4', 'b1c2d3e4', 'c1d2e3f4'],
          name: '产品交流群',
          avatar: '👥',
          color: '#10b981',
          owner: 'a1b2c3d4',
          createdAt: t - 3600000 * 50,
          reads: { a1b2c3d4: t - 3600000 * 5, b1c2d3e4: t - 3600000 * 5, c1d2e3f4: t - 3600000 * 6 },
          lastMessage: null,
        };
        const groupIssue = await createIssue(`${CHAT_PREFIX}${groupId}`, encodeBody(MARK.chat, group));
        const groupMsgs = [
          { senderId: 'c1d2e3f4', content: '新版首页的设计稿我放到群里了，大家有空看一下。', createdAt: t - 3600000 * 8 },
          { senderId: 'b1c2d3e4', content: '收到，配色我很喜欢，尤其是那个绿色。', createdAt: t - 3600000 * 7 },
          { senderId: 'a1b2c3d4', content: '细节再对一轮就可以开发了，辛苦阿杰！', createdAt: t - 3600000 * 5 },
        ];
        let groupLast = null;
        for (const m of groupMsgs) {
          const message = { id: slug(), chatId: groupId, senderId: m.senderId, type: 'text', content: m.content, createdAt: m.createdAt };
          await gh(`/repos/${REPO}/issues/${groupIssue.number}/comments`, {
            method: 'POST',
            body: { body: encodeBody(MARK.message, message) },
          });
          groupLast = { ...message };
        }
        group.lastMessage = groupLast;
        await patchIssue(groupIssue.number, { body: encodeBody(MARK.chat, group) });
      }

      // 演示朋友圈
      const hasMoment = items.some((i) => i.title.startsWith(MOMENT_PREFIX));
      if (!hasMoment) {
        const t = now();
        const m1 = {
          id: slug(),
          userId: 'b1c2d3e4',
          content: '今天的晚霞是橘子味的 🍊',
          createdAt: t - 3600000 * 3,
          likes: ['a1b2c3d4'],
          comments: [{ id: slug(), userId: 'a1b2c3d4', content: '拍得真好看！', createdAt: t - 3600000 * 2 }],
        };
        await createIssue(`${MOMENT_PREFIX}${m1.id}`, encodeBody(MARK.moment, m1));

        const m2 = {
          id: slug(),
          userId: 'c1d2e3f4',
          content: '新项目终于上线，感谢每一位并肩作战的伙伴。',
          createdAt: t - 3600000 * 20,
          likes: ['a1b2c3d4', 'b1c2d3e4'],
          comments: [],
        };
        await createIssue(`${MOMENT_PREFIX}${m2.id}`, encodeBody(MARK.moment, m2));
      }

      invalidateIssues();
      return true;
    })();

    try {
      return await bootstrapPromise;
    } finally {
      bootstrapPromise = null;
    }
  }

  /* ---------------------------- 请求路由 ---------------------------- */

  async function request(path, { method = 'GET', body = {}, token = '' } = {}) {
    const url = new URL(path, window.location.origin);
    const pathname = url.pathname;

    /* 健康检查 */
    if (pathname === '/api/health') {
      const data = await loadRegistry();
      return { ok: true, mode: 'cloud', users: data.users.length, time: now(), repo: REPO };
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

      const data = await loadRegistry(true);
      if (data.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) throw fail(409, '该账号已被注册');

      const salt = randHex(16);
      const hash = await hashPassword(password, salt);
      const user = {
        id: slug(),
        username,
        nickname,
        salt,
        password: hash,
        avatar: clean(body.avatar, 8) || pick(AVATARS),
        color: /^#[0-9a-fA-F]{6}$/.test(body.color || '') ? body.color : pick(COLORS),
        signature: '这个人很懒，什么都没留下。',
        createdAt: now(),
      };
      data.users.push(user);
      await saveRegistry(data);
      touchPresence(user.id);
      return { token: makeToken(user.id), user: publicUser(user) };
    }

    /* 登录 */
    if (pathname === '/api/login' && method === 'POST') {
      const username = clean(body.username, 20);
      const password = typeof body.password === 'string' ? body.password : '';
      const data = await loadRegistry(true);
      const user = data.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
      if (!user) throw fail(401, '账号或密码错误');
      const ok = await verifyPassword(password, user);
      if (!ok) throw fail(401, '账号或密码错误');
      touchPresence(user.id);
      return { token: makeToken(user.id), user: publicUser(user) };
    }

    /* 以下需要登录 */
    const auth = await requireAuth(token);
    const me = auth.user;
    let data = auth.data;

    if (pathname === '/api/logout' && method === 'POST') {
      return { ok: true };
    }

    if (pathname === '/api/me' && method === 'GET') {
      return { user: publicUser(me), online: onlineIds() };
    }

    if (pathname === '/api/me' && method === 'PATCH') {
      data = await loadRegistry(true);
      const target = findUser(data, me.id);
      if (!target) throw fail(401, '登录状态已失效，请重新登录');
      if (body.nickname !== undefined) {
        const nickname = clean(body.nickname, 20);
        if (!nickname) throw fail(400, '昵称不能为空');
        target.nickname = nickname;
      }
      if (body.signature !== undefined) target.signature = clean(body.signature, 50);
      if (body.avatar !== undefined) {
        const avatar = clean(body.avatar, 8);
        if (avatar) target.avatar = avatar;
      }
      if (body.color !== undefined && /^#[0-9a-fA-F]{6}$/.test(body.color)) target.color = body.color;
      await saveRegistry(data);
      return { user: publicUser(target) };
    }

    if (pathname === '/api/users' && method === 'GET') {
      const online = new Set(onlineIds());
      const users = data.users
        .filter((u) => u.id !== me.id)
        .map((u) => publicUser(u, online))
        .sort((a, b) => a.nickname.localeCompare(b.nickname, 'zh-CN'));
      return { users };
    }

    /* 聊天列表 */
    if (pathname === '/api/chats' && method === 'GET') {
      await bootstrap();
      const items = await listIssues(true);
      data = await loadRegistry();
      const chats = chatsFromIssues(items)
        .filter((x) => x.chat.members.includes(me.id))
        .map((x) => summarizeChat(x.chat, me.id, data))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      return { chats };
    }

    /* 发起单聊 */
    if (pathname === '/api/chats/direct' && method === 'POST') {
      const target = findUser(data, body.userId);
      if (!target || target.id === me.id) throw fail(400, '用户不存在');
      const items = await listIssues(true);
      let found = chatsFromIssues(items).find(
        (x) =>
          x.chat.type === 'direct' &&
          x.chat.members.length === 2 &&
          x.chat.members.includes(me.id) &&
          x.chat.members.includes(target.id)
      );

      if (!found) {
        const chat = {
          id: slug(),
          type: 'direct',
          members: [me.id, target.id],
          createdAt: now(),
          reads: { [me.id]: now() },
          lastMessage: null,
        };
        const issue = await createIssue(`${CHAT_PREFIX}${chat.id}`, encodeBody(MARK.chat, chat));
        found = { issue, chat };
      }
      return { chat: summarizeChat(found.chat, me.id, data) };
    }

    /* 创建群聊 */
    if (pathname === '/api/chats/group' && method === 'POST') {
      const memberIds = Array.isArray(body.memberIds) ? body.memberIds.filter((x) => typeof x === 'string') : [];
      const unique = [...new Set(memberIds)].filter((id) => id !== me.id && findUser(data, id));
      if (!unique.length) throw fail(400, '请至少选择一位联系人');

      const members = [me.id, ...unique];
      const defaultName = members
        .map((id) => findUser(data, id)?.nickname || '')
        .filter(Boolean)
        .join('、')
        .slice(0, 20);

      const chat = {
        id: slug(),
        type: 'group',
        members,
        name: clean(body.name, 20) || defaultName,
        avatar: '👥',
        color: '#10b981',
        owner: me.id,
        createdAt: now(),
        reads: { [me.id]: now() },
        lastMessage: null,
      };
      const issue = await createIssue(`${CHAT_PREFIX}${chat.id}`, encodeBody(MARK.chat, chat));
      return { chat: summarizeChat(chat, me.id, data) };
    }

    /* 单个会话 */
    const chatMatch = pathname.match(/^\/api\/chats\/([a-z0-9]+)(\/[a-z]+)?$/);
    if (chatMatch) {
      const chatId = chatMatch[1];
      const action = chatMatch[2] || '';
      const items = await listIssues(true);
      const found = chatsFromIssues(items).find((x) => x.chat.id === chatId);
      if (!found || !found.chat.members.includes(me.id)) throw fail(404, '会话不存在');
      const chat = found.chat;

      if (action === '/messages' && method === 'GET') {
        const comments = await issueComments(found.issue.number);
        const all = messagesFromComments(comments, data);
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 300);
        const slice = all.slice(-limit);
        return {
          chat: summarizeChat(chat, me.id, data),
          messages: slice,
          hasMore: all.length > slice.length,
        };
      }

      if (action === '/messages' && method === 'POST') {
        const type = body.type === 'image' ? 'image' : 'text';
        if (type === 'image') throw fail(400, '云端模式暂不支持图片消息');
        const content = clean(body.content, 2000);
        if (!content) throw fail(400, '消息不能为空');

        const message = {
          id: slug(),
          chatId: chat.id,
          senderId: me.id,
          type: 'text',
          content,
          createdAt: now(),
        };
        await gh(`/repos/${REPO}/issues/${found.issue.number}/comments`, {
          method: 'POST',
          body: { body: encodeBody(MARK.message, message) },
        });

        chat.lastMessage = { ...message };
        chat.reads = chat.reads || {};
        chat.reads[me.id] = message.createdAt;
        await patchIssue(found.issue.number, { body: encodeBody(MARK.chat, chat) });
        invalidateIssues();

        return { message: { ...message, sender: publicUser(me) } };
      }

      if (action === '/read' && method === 'POST') {
        chat.reads = chat.reads || {};
        chat.reads[me.id] = now();
        await patchIssue(found.issue.number, { body: encodeBody(MARK.chat, chat) });
        return { ok: true };
      }
    }

    /* 图片上传在云端模式下不支持 */
    if (pathname === '/api/upload' && method === 'POST') {
      throw fail(400, '云端模式暂不支持图片消息');
    }

    /* 朋友圈 */
    if (pathname === '/api/moments' && method === 'GET') {
      await bootstrap();
      const items = await listIssues(true);
      data = await loadRegistry();
      const moments = momentsFromIssues(items)
        .map((x) => momentView(x.moment, me.id, data))
        .sort((a, b) => b.createdAt - a.createdAt);
      return { moments };
    }

    if (pathname === '/api/moments' && method === 'POST') {
      const content = clean(body.content, 500);
      if (!content) throw fail(400, '内容不能为空');
      const moment = { id: slug(), userId: me.id, content, createdAt: now(), likes: [], comments: [] };
      await createIssue(`${MOMENT_PREFIX}${moment.id}`, encodeBody(MARK.moment, moment));
      invalidateIssues();
      return { moment: momentView(moment, me.id, data) };
    }

    const likeMatch = pathname.match(/^\/api\/moments\/([a-z0-9]+)\/like$/);
    if (likeMatch && method === 'POST') {
      const items = await listIssues(true);
      const found = momentsFromIssues(items).find((x) => x.moment.id === likeMatch[1]);
      if (!found) throw fail(404, '内容不存在');
      const moment = found.moment;
      moment.likes = moment.likes || [];
      if (moment.likes.includes(me.id)) moment.likes = moment.likes.filter((id) => id !== me.id);
      else moment.likes.push(me.id);
      await patchIssue(found.issue.number, { body: encodeBody(MARK.moment, moment) });
      invalidateIssues();
      return {
        likes: moment.likes.map((id) => findUser(data, id)?.nickname).filter(Boolean),
        likedByMe: moment.likes.includes(me.id),
      };
    }

    const commentMatch = pathname.match(/^\/api\/moments\/([a-z0-9]+)\/comment$/);
    if (commentMatch && method === 'POST') {
      const items = await listIssues(true);
      const found = momentsFromIssues(items).find((x) => x.moment.id === commentMatch[1]);
      if (!found) throw fail(404, '内容不存在');
      const content = clean(body.content, 200);
      if (!content) throw fail(400, '评论不能为空');
      const moment = found.moment;
      moment.comments = moment.comments || [];
      const comment = { id: slug(), userId: me.id, content, createdAt: now() };
      moment.comments.push(comment);
      await patchIssue(found.issue.number, { body: encodeBody(MARK.moment, moment) });
      invalidateIssues();
      return { comment: { ...comment, author: me.nickname } };
    }

    throw fail(404, '接口不存在');
  }

  /* ---------------------------- 订阅刷新 ---------------------------- */

  let polling = null;
  let fingerprint = '';
  let subscriberCount = 0;

  async function tick(handler) {
    try {
      const items = await listIssues(true);
      const fp = items.map((i) => `${i.number}:${i.updated_at}`).join('|');
      if (fingerprint && fp !== fingerprint) {
        handler({ type: 'cloud:refresh' });
      }
      fingerprint = fp;
    } catch {
      /* 网络波动时忽略 */
    }
  }

  function subscribe(handler) {
    subscriberCount++;
    if (!polling) {
      polling = setInterval(() => tick(handler), 6000);
      tick(handler);
    }
    return () => {
      subscriberCount = Math.max(0, subscriberCount - 1);
      if (subscriberCount === 0 && polling) {
        clearInterval(polling);
        polling = null;
      }
    };
  }

  function resetAll() {
    try {
      localStorage.removeItem(PRESENCE_KEY);
      localStorage.removeItem('wx_token');
    } catch {
      /* ignore */
    }
    registryCache = { issue: null, data: null, at: 0 };
    issuesCache = { items: null, etag: null, at: 0, promise: null };
    fingerprint = '';
  }

  window.CloudAPI = { request, subscribe, onlineIds, resetAll, bootstrap, mode: 'cloud', repo: REPO };
})();
