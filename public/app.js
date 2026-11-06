'use strict';

/* ============================================================
   ChatBox · 前端逻辑
   ============================================================ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const EMOJIS = [
  '😀', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😗', '😙', '😚', '😋',
  '😛', '😜', '🤪', '😝', '🤗', '🤭', '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏', '😣', '😥', '😮', '🤐', '😯',
  '😪', '😫', '🥱', '😴', '😌', '🤤', '😒', '😓', '😔', '😕', '🙃', '🤑', '😲', '🙁', '😖', '😞', '😟', '😤',
  '😢', '😭', '😦', '😧', '😨', '😩', '🤯', '😬', '😰', '😱', '🥵', '🥶', '😳', '😵', '🥴', '😠', '😡', '🤬',
  '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥳', '🥺', '🤠', '🤡', '🤥', '🤫', '🧐', '🤓', '😈', '👻', '💀', '👽',
  '🤖', '💩', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘',
  '🤙', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤝', '🙏', '💪', '🦾', '❤️', '🧡', '💛',
  '💚', '💙', '💜', '🖤', '🤍', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '🎉', '🎊', '🎁', '🎈',
  '🔥', '✨', '⭐', '🌟', '💫', '💥', '💦', '💨', '🌈', '☀️', '🌤️', '🌧️', '⛄', '🍀', '🌸', '🌺', '🌻', '🌹',
  '🍎', '🍊', '🍋', '🍉', '🍓', '🍒', '🍑', '🍕', '🍔', '🍟', '🍦', '🍰', '🎂', '🍵', '☕', '🍺', '🍻', '⚽',
  '🏀', '🏆', '🎮', '🎧', '🎵', '🚀', '✈️', '🏠', '🌍', '💡', '📚', '💻', '📱', '💰', '✅', '❌', '❓', '❗',
  '💯', '👏', '🙌', '👀', '🧠', '🐱', '🐶', '🦊', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐰', '🐻', '🦄', '🐷',
];

const AVATAR_CHOICES = ['😀', '😎', '🐱', '🐶', '🦊', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐰', '🐻', '🦄', '🐷', '🐔', '🐧', '🐦', '🌸', '🌻', '🍀', '🌈', '🌙', '⭐', '🔥', '⚡', '🍉', '🍓', '🍋', '🍑', '🎈', '🎧', '🎮', '🚀', '⚽', '🎨'];

const COLOR_CHOICES = ['#5b8def', '#3b82f6', '#06b6d4', '#10b981', '#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#8b5cf6', '#6366f1', '#14b8a6', '#64748b'];

const IS_CLOUD = !!window.CloudAPI;
const IS_STATIC = !IS_CLOUD && !!window.LocalAPI;
// 静态模式下用 sessionStorage：多个标签页可以分别登录不同账号做聊天演示
const tokenStore = (() => {
  try {
    return IS_STATIC ? sessionStorage : localStorage;
  } catch {
    return localStorage;
  }
})();

function readToken() {
  try {
    return tokenStore.getItem('wx_token') || '';
  } catch {
    return '';
  }
}

const state = {
  token: readToken(),
  me: null,
  chats: [],
  contacts: [],
  messages: {},
  chatMeta: {},
  currentChatId: null,
  tab: 'chats',
  search: '',
  online: new Set(),
  moments: [],
  es: null,
  busOff: null,
  heartbeat: null,
  groupPicked: new Set(),
};

/* ---------------------------- 基础工具 ---------------------------- */

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function safeColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#5b8def';
}

function avatarHtml(user, size = 'avatar-md', extraClass = '') {
  if (!user) user = { nickname: '?', avatar: '👤', color: '#9ca3af' };
  const raw = String(user.avatar || '').trim();
  const isEmoji = raw && !/^[a-zA-Z0-9\u4e00-\u9fa5]$/.test(raw);
  const content = isEmoji ? esc(raw) : `<span class="avatar-text">${esc((user.nickname || '?').slice(0, 1))}</span>`;
  return `<span class="avatar ${size} ${extraClass}" style="--avatar-color:${safeColor(user.color)}">${content}</span>`;
}

function initials(name) {
  return (name || '?').slice(0, 1);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function fmtListTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const n = new Date();
  if (sameDay(d, n)) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const y = new Date(n.getTime() - 86400000);
  if (sameDay(d, y)) return '昨天';
  if (d.getFullYear() === n.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtDivider(ts) {
  const d = new Date(ts);
  const n = new Date();
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (sameDay(d, n)) return hm;
  const y = new Date(n.getTime() - 86400000);
  if (sameDay(d, y)) return `昨天 ${hm}`;
  if (d.getFullYear() === n.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}

function fmtMomentTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 86400000 * 2) return '昨天';
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function linkify(text) {
  return esc(text).replace(/(https?:\/\/[^\s<]+)/g, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}

function toast(message, type = '') {
  const wrap = $('#toastWrap');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .2s, transform .2s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(-6px)';
    setTimeout(() => el.remove(), 220);
  }, 2400);
}

/* ---------------------------- API ---------------------------- */

async function api(path, { method = 'GET', body, token = state.token } = {}) {
  if (IS_CLOUD) {
    try {
      return await window.CloudAPI.request(path, { method, body: body === undefined ? {} : body, token });
    } catch (err) {
      if (err.status === 401 && state.token) endSession(true);
      throw err;
    }
  }

  if (IS_STATIC) {
    try {
      return await window.LocalAPI.request(path, { method, body: body === undefined ? {} : body, token });
    } catch (err) {
      if (err.status === 401 && state.token) endSession(true);
      throw err;
    }
  }

  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('网络连接失败，请检查服务是否运行');
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }

  if (res.status === 401 && state.token) {
    endSession(true);
    throw new Error(data.error || '登录状态已失效');
  }
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

/* ---------------------------- 会话状态 ---------------------------- */

function endSession(silent = false) {
  state.token = '';
  state.me = null;
  state.chats = [];
  state.contacts = [];
  state.messages = {};
  state.chatMeta = {};
  state.currentChatId = null;
  state.moments = [];
  state.online = new Set();
  try {
    tokenStore.removeItem('wx_token');
    // 清理旧版本可能留下的 token
    if (IS_STATIC) localStorage.removeItem('wx_token');
  } catch {
    /* ignore */
  }
  if (state.es) {
    state.es.close();
    state.es = null;
  }
  if (state.busOff) {
    state.busOff();
    state.busOff = null;
  }
  if (state.heartbeat) {
    clearInterval(state.heartbeat);
    state.heartbeat = null;
  }
  document.title = 'ChatBox';
  $('#appView').classList.add('hidden');
  $('#authView').classList.remove('hidden');
  $('#loginForm').reset();
  $('#registerForm').reset();
  if (!silent) toast('已退出登录');
}

function beginSession(token, user) {
  state.token = token;
  state.me = user;
  tokenStore.setItem('wx_token', token);
  $('#authView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  renderMeBits();
  if (IS_CLOUD) {
    const imageBtn = $('#imageBtn');
    if (imageBtn) imageBtn.classList.add('hidden');
  }
  switchTab('chats');
  refreshChats();
  refreshContacts();
  connectEvents();
}

/* ---------------------------- 认证页 ---------------------------- */

function bindAuth() {
  $$('.auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.authTab;
      $$('.auth-tab').forEach((t) => t.classList.toggle('active', t === tab));
      $('#loginForm').classList.toggle('hidden', name !== 'login');
      $('#registerForm').classList.toggle('hidden', name !== 'register');
      $('#loginError').textContent = '';
      $('#registerError').textContent = '';
    });
  });

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('#loginError');
    const btn = $('#loginForm button[type=submit]');
    errEl.textContent = '';
    btn.disabled = true;
    btn.textContent = '登录中…';
    try {
      const { token, user } = await api('/api/login', {
        method: 'POST',
        token: '',
        body: { username: $('#loginUsername').value.trim(), password: $('#loginPassword').value },
      });
      beginSession(token, user);
      toast(`欢迎回来，${user.nickname}`);
    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '登 录';
    }
  });

  $('#registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('#registerError');
    const btn = $('#registerForm button[type=submit]');
    errEl.textContent = '';
    const password = $('#regPassword').value;
    if (password !== $('#regPassword2').value) {
      errEl.textContent = '两次输入的密码不一致';
      return;
    }
    btn.disabled = true;
    btn.textContent = '注册中…';
    try {
      const { token, user } = await api('/api/register', {
        method: 'POST',
        token: '',
        body: {
          username: $('#regUsername').value.trim(),
          nickname: $('#regNickname').value.trim(),
          password,
        },
      });
      beginSession(token, user);
      toast(`注册成功，欢迎你，${user.nickname}`);
    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '注册并登录';
    }
  });
}

/* ---------------------------- 应用初始化 ---------------------------- */

function bindApp() {
  $$('.rail-btn[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  $('#railMe').addEventListener('click', () => switchTab('me'));
  $('#logoutBtn').addEventListener('click', async () => {
    try {
      await api('/api/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    endSession();
  });

  $('#searchInput').addEventListener('input', (e) => {
    state.search = e.target.value.trim();
    renderPanel();
  });

  $('#newChatBtn').addEventListener('click', openGroupModal);

  $('#msgInput').addEventListener('input', () => autoResize($('#msgInput')));
  $('#msgInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendText();
    }
  });
  $('#sendBtn').addEventListener('click', sendText);

  $('#emojiBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#emojiPop').classList.toggle('hidden');
  });
  $('#emojiPop').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-emoji]');
    if (!btn) return;
    insertEmoji(btn.dataset.emoji);
  });

  $('#imageBtn').addEventListener('click', () => $('#imageInput').click());
  $('#imageInput').addEventListener('change', handleImagePick);

  $('#msgList').addEventListener('click', (e) => {
    const img = e.target.closest('.msg-bubble.image img');
    if (img) {
      $('#lightboxImg').src = img.src;
      $('#lightbox').classList.remove('hidden');
    }
  });
  $('#lightbox').addEventListener('click', () => $('#lightbox').classList.add('hidden'));

  $('#chatHead').addEventListener('click', (e) => {
    if (e.target.closest('#chatBackBtn')) {
      $('#chatPane').classList.remove('open');
      state.currentChatId = null;
      renderPanel();
      renderMain();
    }
  });

  // 群聊弹窗
  $('#modalClose').addEventListener('click', closeGroupModal);
  $('#groupCancel').addEventListener('click', closeGroupModal);
  $('#modalMask').addEventListener('click', (e) => {
    if (e.target === $('#modalMask')) closeGroupModal();
  });
  $('#groupPickList').addEventListener('click', (e) => {
    const item = e.target.closest('.pick-item');
    if (!item) return;
    const id = item.dataset.userId;
    if (state.groupPicked.has(id)) state.groupPicked.delete(id);
    else state.groupPicked.add(id);
    item.classList.toggle('selected', state.groupPicked.has(id));
    $('#groupCount').textContent = `已选 ${state.groupPicked.size} 人`;
    $('#groupCreate').disabled = state.groupPicked.size === 0;
  });
  $('#groupCreate').addEventListener('click', createGroup);

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#emojiPop') && !e.target.closest('#emojiBtn')) {
      $('#emojiPop').classList.add('hidden');
    }
  });

  // 面板点击委托
  $('#panelBody').addEventListener('click', (e) => {
    const chatEl = e.target.closest('[data-chat-id]');
    if (chatEl) return openChat(chatEl.dataset.chatId);

    const contactEl = e.target.closest('[data-contact-id]');
    if (contactEl) return startDirectChat(contactEl.dataset.contactId);

    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    if (action === 'discover') switchTab('discover');
    if (action === 'profile') switchTab('me');
    if (action === 'logout') $('#logoutBtn').click();
  });

  // 朋友圈交互（只绑定一次）
  $('#pagePane').addEventListener('click', onMomentsClick);
  $('#pagePane').addEventListener('submit', onMomentsSubmit);

  window.addEventListener('beforeunload', () => {
    if (state.es) state.es.close();
    if (state.busOff) state.busOff();
  });
}

function buildEmojiPop() {
  $('#emojiPop').innerHTML = EMOJIS.map((e) => `<button type="button" data-emoji="${e}">${e}</button>`).join('');
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
}

function insertEmoji(emoji) {
  const ta = $('#msgInput');
  const start = ta.selectionStart ?? ta.value.length;
  const end = ta.selectionEnd ?? ta.value.length;
  ta.value = ta.value.slice(0, start) + emoji + ta.value.slice(end);
  ta.selectionStart = ta.selectionEnd = start + emoji.length;
  autoResize(ta);
  ta.focus();
}

/* ---------------------------- 主界面渲染 ---------------------------- */

function renderMeBits() {
  if (!state.me) return;
  const el = $('#railAvatar');
  el.style.setProperty('--avatar-color', safeColor(state.me.color));
  const raw = String(state.me.avatar || '').trim();
  const isEmoji = raw && !/^[a-zA-Z0-9\u4e00-\u9fa5]$/.test(raw);
  el.innerHTML = isEmoji ? esc(raw) : `<span class="avatar-text">${esc(initials(state.me.nickname))}</span>`;
}

function switchTab(tab) {
  state.tab = tab;
  state.search = '';
  $('#searchInput').value = '';
  $$('.rail-btn[data-tab]').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));

  const titles = { chats: 'ChatBox', contacts: '通讯录', discover: '发现', me: '我' };
  $('#panelTitle').textContent = titles[tab] || 'ChatBox';
  const search = $('#searchInput');
  search.parentElement.classList.toggle('hidden', tab === 'discover' || tab === 'me');
  search.placeholder = tab === 'contacts' ? '搜索联系人' : '搜索';

  $('#newChatBtn').classList.toggle('hidden', tab === 'discover' || tab === 'me');
  $('#chatPane').classList.remove('open');

  renderPanel();
  renderMain();

  if (tab === 'contacts') refreshContacts();
  if (tab === 'discover') loadMoments();

  $('#appView').classList.toggle('mode-page', tab === 'discover' || tab === 'me');
}

function renderPanel() {
  const body = $('#panelBody');
  if (!state.me) return;
  const scrollTop = body.scrollTop;
  const paint = (html) => {
    body.innerHTML = html;
    body.scrollTop = scrollTop;
  };

  if (state.tab === 'chats') {
    const q = state.search.toLowerCase();
    const list = state.chats.filter((c) => {
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.lastMessage?.content || '').toLowerCase().includes(q);
    });

    if (!list.length) {
      paint(`<div class="empty-list"><b>💬</b>${state.chats.length ? '没有找到相关聊天' : '还没有聊天<br>去通讯录找朋友聊聊吧'}</div>`);
      return;
    }

    paint(list
      .map(
        (chat) => `
        <div class="chat-item ${chat.id === state.currentChatId ? 'active' : ''}" data-chat-id="${chat.id}">
          ${avatarHtml(chat, 'avatar-md')}
          <div class="chat-item-main">
            <div class="chat-item-row">
              <div class="chat-item-name">${esc(chat.name)}</div>
              <div class="chat-item-time">${fmtListTime(chat.updatedAt)}</div>
            </div>
            <div class="chat-item-preview">
              <span class="preview-text">${esc(chat.lastMessage ? chat.lastMessage.content : '暂无消息')}</span>
              ${chat.unread ? `<span class="badge">${chat.unread > 99 ? '99+' : chat.unread}</span>` : ''}
            </div>
          </div>
        </div>`
      )
      .join('')
    );
    return;
  }

  if (state.tab === 'contacts') {
    const q = state.search.toLowerCase();
    const list = state.contacts.filter((u) => {
      if (!q) return true;
      return u.nickname.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
    });

    if (!list.length) {
      paint(`<div class="empty-list"><b>👥</b>${state.contacts.length ? '没有找到联系人' : '还没有其他用户<br>邀请朋友注册后就能聊天啦'}</div>`);
      return;
    }

    paint(
      `<div class="list-section-title">全部联系人 · ${list.length}</div>` +
      list
        .map(
          (u) => `
        <div class="contact-item" data-contact-id="${u.id}">
          ${avatarHtml(u, 'avatar-md')}
          <div class="contact-main">
            <div class="contact-name">${esc(u.nickname)}</div>
            <div class="contact-sign">${esc(u.signature || '这个人很懒，什么都没留下。')}</div>
          </div>
          <span class="online-dot ${state.online.has(u.id) ? 'on' : ''}" title="${state.online.has(u.id) ? '在线' : '离线'}"></span>
        </div>`
        )
        .join('')
    );
    return;
  }

  if (state.tab === 'discover') {
    paint(`
      <div class="menu-item" data-action="discover">
        <div class="menu-icon">🌿</div>
        <div class="menu-main">
          <div class="menu-name">朋友圈</div>
          <div class="menu-desc">分享生活里的点滴</div>
        </div>
        <svg class="chevron" viewBox="0 0 24 24"><use href="#i-chevron"/></svg>
      </div>`);
    return;
  }

  if (state.tab === 'me') {
    paint(`
      <div class="menu-item" data-action="profile">
        ${avatarHtml(state.me, 'avatar-md')}
        <div class="menu-main">
          <div class="menu-name">${esc(state.me.nickname)}</div>
          <div class="menu-desc">@${esc(state.me.username)}</div>
        </div>
        <svg class="chevron" viewBox="0 0 24 24"><use href="#i-chevron"/></svg>
      </div>
      <div class="menu-item" data-action="profile">
        <div class="menu-icon">✏️</div>
        <div class="menu-main">
          <div class="menu-name">个人信息</div>
          <div class="menu-desc">修改头像、昵称和个性签名</div>
        </div>
        <svg class="chevron" viewBox="0 0 24 24"><use href="#i-chevron"/></svg>
      </div>
      <div class="menu-item" data-action="logout">
        <div class="menu-icon">🚪</div>
        <div class="menu-main">
          <div class="menu-name">退出登录</div>
          <div class="menu-desc">下次仍可使用账号密码登录</div>
        </div>
        <svg class="chevron" viewBox="0 0 24 24"><use href="#i-chevron"/></svg>
      </div>`);
  }
}

function renderMain() {
  const chatPane = $('#chatPane');
  const pagePane = $('#pagePane');
  const chat = state.chats.find((c) => c.id === state.currentChatId);

  if (state.tab === 'discover') {
    chatPane.classList.add('hidden');
    pagePane.classList.remove('hidden');
    renderMomentsPage();
    return;
  }

  if (state.tab === 'me') {
    chatPane.classList.add('hidden');
    pagePane.classList.remove('hidden');
    renderProfilePage();
    return;
  }

  if (chat) {
    chatPane.classList.remove('hidden');
    pagePane.classList.add('hidden');
    renderChatHeader(chat);
    renderMessages();
    return;
  }

  chatPane.classList.add('hidden');
  pagePane.classList.remove('hidden');
  pagePane.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">
        <svg viewBox="0 0 100 100"><use href="#i-logo"/></svg>
      </div>
      <h3>${state.tab === 'contacts' ? '选择一个联系人开始聊天' : '选择一个会话开始聊天'}</h3>
      <p>${state.tab === 'contacts' ? '点击通讯录里的好友，即可发送消息' : IS_CLOUD ? '消息会通过 GitHub Issues 实时同步' : '消息会实时送达，支持文字、表情与图片'}</p>
    </div>`;
}

function updateBadges() {
  const total = state.chats.reduce((sum, c) => sum + (c.unread || 0), 0);
  const badge = $('#railUnread');
  badge.textContent = total > 99 ? '99+' : String(total);
  badge.classList.toggle('hidden', total === 0);
  document.title = total ? `(${total > 99 ? '99+' : total}) ChatBox` : 'ChatBox';
}

/* ---------------------------- 会话与消息 ---------------------------- */

async function refreshChats() {
  try {
    const { chats } = await api('/api/chats');
    state.chats = chats;
    updateBadges();
    if (state.tab === 'chats' || state.tab === 'contacts') renderPanel();
    if (state.tab === 'chats' && state.currentChatId) {
      const chat = state.chats.find((c) => c.id === state.currentChatId);
      if (chat) renderChatHeader(chat);
    }
  } catch (err) {
    console.error(err);
  }
}

async function refreshContacts() {
  try {
    const { users } = await api('/api/users');
    state.contacts = users;
    if (state.tab === 'contacts') renderPanel();
  } catch (err) {
    console.error(err);
  }
}

function replaceChat(chat) {
  const idx = state.chats.findIndex((c) => c.id === chat.id);
  if (idx >= 0) state.chats[idx] = chat;
  else state.chats.unshift(chat);
  state.chats.sort((a, b) => b.updatedAt - a.updatedAt);
  updateBadges();
}

async function openChat(chatId) {
  const chat = state.chats.find((c) => c.id === chatId);
  if (!chat) return;
  state.currentChatId = chatId;
  chat.unread = 0;
  updateBadges();
  renderPanel();
  renderMain();
  $('#chatPane').classList.add('open');

  try {
    const data = await api(`/api/chats/${chatId}/messages?limit=200`);
    state.messages[chatId] = data.messages;
    replaceChat(data.chat);
    if (state.currentChatId === chatId) {
      renderChatHeader(data.chat);
      renderMessages(true);
    }
    markRead(chatId);
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function markRead(chatId) {
  const chat = state.chats.find((c) => c.id === chatId);
  if (chat) {
    chat.unread = 0;
    updateBadges();
    if (state.tab === 'chats') renderPanel();
  }
  try {
    await api(`/api/chats/${chatId}/read`, { method: 'POST' });
  } catch {
    /* ignore */
  }
}

async function startDirectChat(userId) {
  try {
    const { chat } = await api('/api/chats/direct', { method: 'POST', body: { userId } });
    replaceChat(chat);
    renderPanel();
    openChat(chat.id);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderChatHeader(chat) {
  if (!chat) return;
  const online = chat.type === 'direct' && chat.peer ? state.online.has(chat.peer.id) : false;
  let sub;
  if (chat.type === 'group') sub = `${chat.memberCount} 位成员`;
  else sub = online ? '在线' : '离线';
  if (chat.type === 'direct' && chat.peer) sub = `${online ? '在线' : '离线'} · @${chat.peer.username}`;

  $('#chatHead').innerHTML = `
    <button class="chat-head-back" id="chatBackBtn" title="返回">
      <svg viewBox="0 0 24 24"><use href="#i-back"/></svg>
    </button>
    ${avatarHtml(chat, 'avatar-sm')}
    <div class="chat-head-info">
      <div class="chat-head-name">
        ${esc(chat.name)}
        ${chat.type === 'group' ? '<span class="group-pill">群聊</span>' : ''}
      </div>
      <div class="chat-head-sub">${esc(sub)}</div>
    </div>`;
}

function messageHtml(message, chat, prevTs, showTime, isNew = false) {
  const self = message.senderId === state.me.id;
  const sender = message.sender || (self ? state.me : null);
  const showSender = chat.type === 'group' && !self;
  const timeHtml = showTime
    ? `<div class="time-divider"><span>${fmtDivider(message.createdAt)}</span></div>`
    : '';

  const body =
    message.type === 'image'
      ? `<div class="msg-bubble image"><img src="${esc(message.content)}" alt="图片" loading="lazy"></div>`
      : `<div class="msg-bubble">${linkify(message.content)}</div>`;

  return `${timeHtml}
    <div class="msg-row ${self ? 'self' : ''} ${isNew ? 'msg-new' : ''}" data-message-id="${message.id}">
      ${avatarHtml(sender, 'avatar-sm')}
      <div class="msg-body">
        ${showSender ? `<div class="msg-sender">${esc(sender?.nickname || '')}</div>` : ''}
        ${body}
      </div>
    </div>`;
}

function renderMessages(scrollToBottom = false) {
  const chatId = state.currentChatId;
  const chat = state.chats.find((c) => c.id === chatId);
  const list = state.messages[chatId];
  const container = $('#msgList');
  if (!chat || !list) {
    container.innerHTML = '';
    return;
  }

  let html = '<div class="msg-list-inner">';
  let prevTs = 0;
  list.forEach((message) => {
    const gap = message.createdAt - prevTs;
    const showTime = !prevTs || gap > 5 * 60 * 1000 || !sameDay(new Date(prevTs), new Date(message.createdAt));
    html += messageHtml(message, chat, prevTs, showTime);
    prevTs = message.createdAt;
  });
  html += '</div>';
  container.innerHTML = html;

  if (scrollToBottom) {
    container.scrollTop = container.scrollHeight;
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }
}

function appendMessage(chatId, message, isNew = true) {
  if (!state.messages[chatId]) return;
  if (state.messages[chatId].some((m) => m.id === message.id)) return;
  const nearBottom = (() => {
    const el = $('#msgList');
    return el.scrollHeight - el.scrollTop - el.clientHeight < 160;
  })();
  state.messages[chatId].push(message);
  if (state.currentChatId === chatId) {
    renderMessages();
    if (nearBottom || message.senderId === state.me.id) {
      const el = $('#msgList');
      el.scrollTop = el.scrollHeight;
    }
  }
  return isNew;
}

async function sendText() {
  const input = $('#msgInput');
  const content = input.value.trim();
  if (!content) return;
  if (!state.currentChatId) return;
  const chatId = state.currentChatId;
  input.value = '';
  autoResize(input);
  const ok = await postMessage(chatId, 'text', content);
  if (!ok) {
    input.value = content;
    autoResize(input);
    input.focus();
  }
}

async function postMessage(chatId, type, content) {
  setSendStatus('发送中…');
  try {
    const { message } = await api(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      body: { type, content },
    });
    appendMessage(chatId, message);
    setSendStatus('已发送');
    setTimeout(() => setSendStatus(''), 1500);
    return true;
  } catch (err) {
    setSendStatus('发送失败');
    toast(err.message, 'error');
    setTimeout(() => setSendStatus(''), 3000);
    return false;
  }
}

function setSendStatus(text) {
  $('#sendStatus').textContent = text;
}

async function handleImagePick(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
    toast('仅支持 png / jpg / gif / webp 图片', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    toast('图片不能超过 5MB', 'error');
    return;
  }
  if (!state.currentChatId) {
    toast('请先选择一个会话', 'error');
    return;
  }
  const chatId = state.currentChatId;
  const reader = new FileReader();
  reader.onload = async () => {
    setSendStatus('上传中…');
    try {
      const { url } = await api('/api/upload', { method: 'POST', body: { data: reader.result } });
      await postMessage(chatId, 'image', url);
    } catch (err) {
      setSendStatus('上传失败');
      toast(err.message, 'error');
    }
  };
  reader.readAsDataURL(file);
}

/* ---------------------------- SSE ---------------------------- */

function connectEvents() {
  if (!state.token) return;

  if (IS_CLOUD) {
    if (state.busOff) state.busOff();
    state.busOff = window.CloudAPI.subscribe((payload) => {
      if (payload.for && state.me && payload.for !== state.me.id) return;
      handleEvent(payload);
    });
    handleEvent({ type: 'hello', online: window.CloudAPI.onlineIds() });
    return;
  }

  if (IS_STATIC) {
    if (state.busOff) state.busOff();
    state.busOff = window.LocalAPI.subscribe((payload) => {
      if (payload.for && state.me && payload.for !== state.me.id) return;
      handleEvent(payload);
    });
    handleEvent({ type: 'hello', online: window.LocalAPI.onlineIds() });

    if (!state.heartbeat) {
      state.heartbeat = setInterval(async () => {
        if (!state.me || !state.token) return;
        try {
          const { online } = await api('/api/me');
          state.online = new Set(online || []);
          if (state.tab === 'contacts') renderPanel();
          if (state.currentChatId) {
            const chat = state.chats.find((c) => c.id === state.currentChatId);
            if (chat) renderChatHeader(chat);
          }
        } catch {
          /* ignore */
        }
      }, 15000);
    }
    return;
  }

  if (state.es) state.es.close();
  const es = new EventSource(`/api/events?token=${encodeURIComponent(state.token)}`);
  state.es = es;

  es.onmessage = (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    handleEvent(payload);
  };

  es.onerror = () => {
    // EventSource 会自动重连，这里只更新在线状态
    state.online = new Set(state.online.size ? state.online : []);
  };
}

function handleEvent(payload) {
  switch (payload.type) {
    case 'hello': {
      state.online = new Set(payload.online || []);
      if (state.tab === 'contacts') renderPanel();
      if (state.currentChatId) {
        const chat = state.chats.find((c) => c.id === state.currentChatId);
        if (chat) renderChatHeader(chat);
      }
      break;
    }
    case 'presence': {
      if (payload.online) state.online.add(payload.userId);
      else state.online.delete(payload.userId);
      if (state.tab === 'contacts') renderPanel();
      if (state.currentChatId) {
        const chat = state.chats.find((c) => c.id === state.currentChatId);
        if (chat) renderChatHeader(chat);
      }
      break;
    }
    case 'message': {
      const chat = payload.chat;
      replaceChat(chat);
      if (state.tab === 'chats') renderPanel();

      if (state.currentChatId === chat.id) {
        appendMessage(chat.id, payload.message);
        if (payload.message.senderId !== state.me.id) markRead(chat.id);
      } else if (payload.message.senderId !== state.me.id) {
        if (state.tab === 'contacts') renderPanel();
      }
      break;
    }
    case 'chat:new': {
      replaceChat(payload.chat);
      if (state.tab === 'chats') renderPanel();
      break;
    }
    case 'user:update': {
      const u = payload.user;
      if (u.id === state.me.id) {
        state.me = u;
        renderMeBits();
      }
      state.contacts = state.contacts.map((c) => (c.id === u.id ? { ...c, ...u } : c));
      state.chats = state.chats.map((c) => {
        if (c.type === 'direct' && c.peer?.id === u.id) return { ...c, name: u.nickname, avatar: u.avatar, color: u.color };
        return c;
      });
      if (state.tab === 'contacts' || state.tab === 'chats') renderPanel();
      if (state.currentChatId) {
        const chat = state.chats.find((c) => c.id === state.currentChatId);
        if (chat) renderChatHeader(chat);
      }
      break;
    }
    case 'user:joined': {
      refreshContacts();
      break;
    }
    case 'moment:new': {
      if (!state.moments.some((m) => m.id === payload.moment.id)) {
        state.moments.unshift(payload.moment);
        if (state.tab === 'discover' && !momentsLoading) renderMomentsPage();
      }
      break;
    }
    case 'cloud:refresh': {
      refreshChats();
      refreshContacts();
      if (state.currentChatId) {
        const chatId = state.currentChatId;
        api(`/api/chats/${chatId}/messages?limit=200`)
          .then((data) => {
            if (state.currentChatId !== chatId) return;
            // GitHub 评论偶尔有短暂延迟：把本地刚发送、服务端尚未返回的消息先保留
            const fetched = data.messages || [];
            const ids = new Set(fetched.map((m) => m.id));
            const pending = (state.messages[chatId] || []).filter(
              (m) => !ids.has(m.id) && m.senderId === state.me.id && Date.now() - m.createdAt < 120000
            );
            state.messages[chatId] = pending.length
              ? [...fetched, ...pending].sort((a, b) => a.createdAt - b.createdAt)
              : fetched;
            replaceChat(data.chat);
            renderChatHeader(data.chat);
            renderMessages();
          })
          .catch(() => {});
      }
      if (state.tab === 'discover') loadMoments();
      break;
    }
    default:
      break;
  }
}

/* ---------------------------- 群聊 ---------------------------- */

function openGroupModal() {
  state.groupPicked = new Set();
  const list = $('#groupPickList');
  if (!state.contacts.length) {
    list.innerHTML = '<div class="empty-list">还没有其他联系人<br>先去邀请朋友注册吧</div>';
  } else {
    list.innerHTML = state.contacts
      .map(
        (u) => `
      <div class="pick-item" data-user-id="${u.id}">
        ${avatarHtml(u, 'avatar-sm')}
        <span class="pick-name">${esc(u.nickname)}</span>
        <span class="pick-check"><svg viewBox="0 0 24 24"><use href="#i-check"/></svg></span>
      </div>`
      )
      .join('');
  }
  $('#groupName').value = '';
  $('#groupCount').textContent = '已选 0 人';
  $('#groupCreate').disabled = true;
  $('#modalMask').classList.remove('hidden');
}

function closeGroupModal() {
  $('#modalMask').classList.add('hidden');
}

async function createGroup() {
  const ids = [...state.groupPicked];
  if (!ids.length) return;
  const btn = $('#groupCreate');
  btn.disabled = true;
  btn.textContent = '创建中…';
  try {
    const { chat } = await api('/api/chats/group', {
      method: 'POST',
      body: { memberIds: ids, name: $('#groupName').value.trim() },
    });
    replaceChat(chat);
    closeGroupModal();
    switchTab('chats');
    openChat(chat.id);
    toast('群聊创建成功');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '创建群聊';
  }
}

/* ---------------------------- 朋友圈 ---------------------------- */

let momentsLoading = false;

function hasMomentsDraft() {
  const pane = $('#pagePane');
  if (!pane) return false;
  if (pane.querySelector('.moment-comment-form:not(.hidden)')) return true;
  return [...pane.querySelectorAll('textarea, input')].some((el) => el.value.trim() !== '');
}

async function loadMoments() {
  momentsLoading = true;
  const before = JSON.stringify(state.moments);
  if (!state.moments.length) renderMomentsPage();
  try {
    const { moments } = await api('/api/moments');
    state.moments = moments;
  } catch (err) {
    console.error(err);
  } finally {
    momentsLoading = false;
    const changed = JSON.stringify(state.moments) !== before;
    if (state.tab === 'discover' && changed && !hasMomentsDraft()) renderMomentsPage();
  }
}

function renderMomentsPage() {
  const pane = $('#pagePane');
  const scrollTop = pane.scrollTop;

  const items = state.moments
    .map((m) => {
      const comments = m.comments
        .map((c) => `<div class="moment-comment"><b>${esc(c.author)}</b>：${esc(c.content)}</div>`)
        .join('');
      const likes = m.likes.length
        ? `<div class="moment-likes">❤️ <b>${m.likes.map(esc).join('、')}</b></div>`
        : '';
      return `
        <article class="moment" data-moment-id="${m.id}">
          ${avatarHtml(m.author, 'avatar-md')}
          <div class="moment-main">
            <div class="moment-name">${esc(m.author.nickname)}</div>
            <div class="moment-content">${linkify(m.content)}</div>
            <div class="moment-foot">
              <span class="moment-time">${fmtMomentTime(m.createdAt)}</span>
              <button class="moment-action like ${m.likedByMe ? 'liked' : ''}" data-like="${m.id}">
                <svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>
                ${m.likedByMe ? '取消' : '赞'}
              </button>
              <button class="moment-action" data-comment="${m.id}">评论</button>
            </div>
            ${likes || comments ? `<div class="moment-social">${likes}${comments}</div>` : ''}
            <form class="moment-comment-form hidden" data-comment-form="${m.id}">
              <input maxlength="200" placeholder="写下你的评论…">
              <button type="submit">发送</button>
            </form>
          </div>
        </article>`;
    })
    .join('');

  pane.innerHTML = `
    <div class="moments">
      <div class="moments-cover">
        <div class="moments-cover-title">朋友圈</div>
        <div class="moments-cover-sub">分享生活里的点滴</div>
      </div>
      <div class="moments-body">
        <div class="moment-composer">
          ${avatarHtml(state.me, 'avatar-md')}
          <div class="composer-input-wrap">
            <textarea id="momentInput" maxlength="500" placeholder="这一刻的想法…"></textarea>
            <div class="moment-composer-bar">
              <button id="momentPublish" disabled>发表</button>
            </div>
          </div>
        </div>
        ${items || '<div class="empty-list"><b>🌿</b>还没有动态，来发布第一条吧</div>'}
      </div>
    </div>`;

  pane.scrollTop = scrollTop;

  const input = $('#momentInput');
  const publish = $('#momentPublish');
  input.addEventListener('input', () => {
    publish.disabled = !input.value.trim();
  });
  publish.addEventListener('click', async () => {
    const content = input.value.trim();
    if (!content) return;
    publish.disabled = true;
    publish.textContent = '发表中…';
    try {
      const { moment } = await api('/api/moments', { method: 'POST', body: { content } });
      state.moments.unshift(moment);
      renderMomentsPage();
      toast('发布成功');
    } catch (err) {
      toast(err.message, 'error');
      publish.disabled = false;
      publish.textContent = '发表';
    }
  });

}

async function onMomentsClick(e) {
  if (state.tab !== 'discover') return;
  const pane = $('#pagePane');

  const likeBtn = e.target.closest('[data-like]');
  if (likeBtn) {
    try {
      const data = await api(`/api/moments/${likeBtn.dataset.like}/like`, { method: 'POST' });
      const moment = state.moments.find((m) => m.id === likeBtn.dataset.like);
      if (moment) {
        moment.likes = data.likes;
        moment.likedByMe = data.likedByMe;
      }
      renderMomentsPage();
    } catch (err) {
      toast(err.message, 'error');
    }
    return;
  }

  const commentBtn = e.target.closest('[data-comment]');
  if (commentBtn) {
    const form = pane.querySelector(`[data-comment-form="${commentBtn.dataset.comment}"]`);
    if (form) {
      form.classList.toggle('hidden');
      if (!form.classList.contains('hidden')) form.querySelector('input').focus();
    }
  }
}

async function onMomentsSubmit(e) {
  if (state.tab !== 'discover') return;
  const form = e.target.closest('[data-comment-form]');
  if (!form) return;
  e.preventDefault();
  const inputEl = form.querySelector('input');
  const content = inputEl.value.trim();
  if (!content) return;
  try {
    const { comment } = await api(`/api/moments/${form.dataset.commentForm}/comment`, {
      method: 'POST',
      body: { content },
    });
    const moment = state.moments.find((m) => m.id === form.dataset.commentForm);
    if (moment) moment.comments.push(comment);
    renderMomentsPage();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ---------------------------- 我的 ---------------------------- */

function renderProfilePage() {
  const me = state.me;
  const pane = $('#pagePane');

  pane.innerHTML = `
    <div class="profile-page">
      <div class="profile-card">
        <div class="profile-head">
          ${avatarHtml(me, 'avatar-xl')}
          <div class="profile-head-info">
            <h3>${esc(me.nickname)}</h3>
            <p>@${esc(me.username)}</p>
            <span class="online-tag"><span class="online-dot on"></span>在线</span>
          </div>
        </div>

        <div class="profile-section">
          <h4>选择头像</h4>
          <div class="picker-grid" id="avatarPicker">
            ${AVATAR_CHOICES.map(
              (e) => `<button type="button" data-avatar="${e}" class="${me.avatar === e ? 'selected' : ''}">${e}</button>`
            ).join('')}
          </div>
        </div>

        <div class="profile-section">
          <h4>头像底色</h4>
          <div class="picker-grid colors" id="colorPicker">
            ${COLOR_CHOICES.map(
              (c) =>
                `<button type="button" data-color="${c}" class="${me.color === c ? 'selected' : ''}" style="background:${c}"></button>`
            ).join('')}
          </div>
        </div>

        <div class="profile-section">
          <label class="profile-field">
            <span>昵称</span>
            <input id="profileNickname" maxlength="20" value="${esc(me.nickname)}">
          </label>
          <label class="profile-field">
            <span>个性签名</span>
            <textarea id="profileSignature" maxlength="50" rows="2">${esc(me.signature || '')}</textarea>
          </label>
        </div>

        <div class="profile-actions">
          <button class="btn-primary" id="profileSave">保存资料</button>
          <button class="btn-ghost" id="profileLogout">退出登录</button>
        </div>

        <div class="profile-meta">
          账号 ID：${esc(me.id)}<br>
          注册时间：${new Date(me.createdAt).toLocaleString('zh-CN')}<br>
          ${IS_CLOUD ? '账号和消息存储在 GitHub Issues 中，换设备登录即可同步。' : '数据存储在本机浏览器中，清除浏览器数据会删除账号。'}
        </div>
      </div>
    </div>`;

  let pickedAvatar = me.avatar;
  let pickedColor = me.color;

  $('#avatarPicker').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-avatar]');
    if (!btn) return;
    pickedAvatar = btn.dataset.avatar;
    $$('#avatarPicker button').forEach((b) => b.classList.toggle('selected', b === btn));
    $('.avatar-xl', $('#avatarPicker').closest('.profile-card')).style.setProperty('--avatar-color', safeColor(pickedColor));
    $('.avatar-xl', $('#avatarPicker').closest('.profile-card')).textContent = pickedAvatar;
  });

  $('#colorPicker').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-color]');
    if (!btn) return;
    pickedColor = btn.dataset.color;
    $$('#colorPicker button').forEach((b) => b.classList.toggle('selected', b === btn));
    $('.avatar-xl', $('#avatarPicker').closest('.profile-card')).style.setProperty('--avatar-color', safeColor(pickedColor));
  });

  $('#profileSave').addEventListener('click', async () => {
    const nickname = $('#profileNickname').value.trim();
    if (!nickname) return toast('昵称不能为空', 'error');
    const btn = $('#profileSave');
    btn.disabled = true;
    btn.textContent = '保存中…';
    try {
      const { user } = await api('/api/me', {
        method: 'PATCH',
        body: { nickname, avatar: pickedAvatar, color: pickedColor, signature: $('#profileSignature').value.trim() },
      });
      state.me = user;
      renderMeBits();
      renderPanel();
      renderProfilePage();
      toast('资料已更新');
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = '保存资料';
    }
  });

  $('#profileLogout').addEventListener('click', () => $('#logoutBtn').click());
}

/* ---------------------------- 启动 ---------------------------- */

async function bootstrap() {
  bindAuth();
  bindApp();
  buildEmojiPop();

  if (!state.token) return;

  try {
    const { user, online } = await api('/api/me');
    state.me = user;
    state.online = new Set(online || []);
    $('#authView').classList.add('hidden');
    $('#appView').classList.remove('hidden');
    renderMeBits();
    if (IS_CLOUD) {
      const imageBtn = $('#imageBtn');
      if (imageBtn) imageBtn.classList.add('hidden');
    }
    switchTab('chats');
    await Promise.all([refreshChats(), refreshContacts()]);
    connectEvents();
  } catch (err) {
    console.error(err);
    if (err.status === 401) {
      endSession(true);
    } else {
      $('#authView').classList.remove('hidden');
      toast(err.message || '加载失败，请刷新重试', 'error');
    }
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);
