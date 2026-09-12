/* Shared helpers: formatting, DOM shortcuts, session guard, balance beams. */

const UI = {
  icons: {
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    signOut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
  },

  euros(cents, currency = 'EUR') {
    const value = (Math.abs(cents) / 100).toFixed(2);
    return `${cents < 0 ? '-' : ''}${value} ${currency}`;
  },

  plain(cents) {
    return (cents / 100).toFixed(2);
  },

  date(value) {
    return new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  },

  dateTime(value) {
    return new Date(value).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  /** A short "3h ago" / "2d ago" label; falls back to a date once it's over a week old. */
  timeAgo(value) {
    const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const steps = [
      [3600, 60, 'm ago'],
      [86400, 3600, 'h ago'],
      [604800, 86400, 'd ago']
    ];
    for (const [ceiling, unit, suffix] of steps) {
      if (seconds < ceiling) return `${Math.floor(seconds / unit)}${suffix}`;
    }
    return UI.date(value);
  },

  escape(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  },

  el(selector) {
    return document.querySelector(selector);
  },

  notify(target, message, kind = 'error') {
    const node = typeof target === 'string' ? UI.el(target) : target;
    if (!node) return;
    node.innerHTML = `<div class="notice ${kind}">${UI.escape(message)}</div>`;
    if (kind !== 'error') setTimeout(() => (node.innerHTML = ''), 5000);
  },

  query(name) {
    return new URLSearchParams(window.location.search).get(name);
  },

  /** Redirects to the sign-in page when there is no valid session. */
  async requireSession() {
    try {
      const { user } = await API.get('/auth/me');
      const slot = UI.el('#who');
      if (slot) slot.textContent = user.name;
      const avatarSlot = UI.el('#who-avatar');
      if (avatarSlot) avatarSlot.innerHTML = UI.avatarHtml(user, 24);
      return user;
    } catch {
      window.location.href = `/auth.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return null;
    }
  },

  /** First letter of the first and last "word" in a name, for the fallback avatar. */
  initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const first = parts[0][0];
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  },

  /** A color from a small fixed palette, deterministic per id/name so the same person
   *  always gets the same color without anyone having to pick or store one. */
  colorFor(seed) {
    const palette = ['#2b3ad6', '#1c6b53', '#a8402c', '#8a6100', '#7a3ca8', '#2c7a9e', '#a83c7a', '#4f7a2c'];
    const str = String(seed || '');
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    return palette[hash % palette.length];
  },

  /** A photo if the user has one, otherwise a colored circle with their initials —
   *  never a broken image and never blank. */
  avatarHtml(user, size = 32) {
    if (!user) return '';
    const name = user.name || 'Member';
    if (user.avatar) {
      return `<span class="avatar" style="width:${size}px;height:${size}px"><img src="${user.avatar}" alt="${UI.escape(
        name
      )}" /></span>`;
    }
    const color = UI.colorFor(user.id || user._id || name);
    const fontSize = Math.max(10, Math.round(size * 0.4));
    return `<span class="avatar" style="width:${size}px;height:${size}px;background:${color};font-size:${fontSize}px">${UI.escape(
      UI.initials(name)
    )}</span>`;
  },

  /** A photo if the group has one, otherwise its emoji icon in a neutral badge — the
   *  group equivalent of avatarHtml. */
  groupBadgeHtml(group, size = 32) {
    if (!group) return '';
    if (group.photo) {
      return `<span class="avatar" style="width:${size}px;height:${size}px"><img src="${group.photo}" alt="" /></span>`;
    }
    const fontSize = Math.max(12, Math.round(size * 0.55));
    return `<span class="avatar" style="width:${size}px;height:${size}px;background:var(--card);border:1px solid var(--rule);font-size:${fontSize}px">${UI.escape(
      group.icon || '🧾'
    )}</span>`;
  },

  /** Reads an image file, crops it to a centered square, and downsizes it so a stored
   *  photo (user avatar or group photo) stays small regardless of the original. */
  resizeImageFile(file, size = 256, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read that file'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Could not read that image'));
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          const scale = Math.max(size / img.width, size / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  },

  bindLogout() {
    const btn = UI.el('#logout');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const sure = await UI.confirmModal('Are you sure you want to sign out?', {
        title: 'Sign out',
        confirmLabel: 'Sign out'
      });
      if (!sure) return;
      await API.post('/auth/logout');
      window.location.href = '/';
    });
  },

  /** A small modal confirm dialog, styled like the rest of the app instead of the
   *  browser's native confirm(). Resolves true/false; never rejects. */
  confirmModal(message, { title = 'Are you sure?', confirmLabel = 'Confirm', cancelLabel = 'Cancel' } = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="modal-title">
          <h3 id="modal-title">${UI.escape(title)}</h3>
          <p class="muted">${UI.escape(message)}</p>
          <div class="modal-actions">
            <button class="quiet" type="button" data-cancel>${UI.escape(cancelLabel)}</button>
            <button type="button" data-confirm>${UI.escape(confirmLabel)}</button>
          </div>
        </div>`;

      function close(result) {
        overlay.remove();
        document.removeEventListener('keydown', onKeydown);
        resolve(result);
      }
      function onKeydown(event) {
        if (event.key === 'Escape') close(false);
      }

      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close(false);
      });
      overlay.querySelector('[data-cancel]').addEventListener('click', () => close(false));
      overlay.querySelector('[data-confirm]').addEventListener('click', () => close(true));
      document.addEventListener('keydown', onKeydown);

      document.body.appendChild(overlay);
      overlay.querySelector('[data-confirm]').focus();
    });
  },

  /** Wires the notification bell: click toggles a YouTube-style dropdown of recent
   *  activity across the user's groups, and opening it clears the unread badge. */
  bindNotifications({ button = '#notif-bell', panel = '#notif-panel', list = '#notif-list', badge = '#notif-badge' } = {}) {
    const btn = UI.el(button);
    const panelEl = UI.el(panel);
    const listEl = UI.el(list);
    const badgeEl = UI.el(badge);
    if (!btn || !panelEl || !listEl) return;

    const actionIcon = (action) => {
      if (action.startsWith('expense.')) return '💰';
      if (action.startsWith('settlement.')) return '💸';
      if (action.startsWith('group.join')) return '🔗';
      if (action.startsWith('group.member')) return '👥';
      return '🧾';
    };

    function paintBadge(count) {
      if (!badgeEl) return;
      badgeEl.hidden = !count;
      badgeEl.textContent = count > 9 ? '9+' : String(count);
    }

    async function refreshBadge() {
      try {
        const { unreadCount } = await API.get('/notifications');
        paintBadge(unreadCount);
      } catch {
        /* not signed in, or offline — leave the badge as-is */
      }
    }

    async function openPanel() {
      panelEl.hidden = false;
      listEl.innerHTML = '<div class="notif-item muted">Loading…</div>';
      try {
        const { notifications } = await API.get('/notifications');
        listEl.innerHTML = notifications.length
          ? notifications
              .map(
                (n) => `
            <div class="notif-item">
              <span>${actionIcon(n.action)}</span>
              <div class="notif-text">
                <div>${UI.escape(n.summary)}</div>
                <time>${UI.escape(n.group ? n.group.name : '')} · ${UI.timeAgo(n.createdAt)}</time>
              </div>
            </div>`
              )
              .join('')
          : '<div class="notif-item muted">Nothing yet. Activity from your groups will show up here.</div>';

        await API.post('/notifications/seen');
        paintBadge(0);
      } catch (err) {
        listEl.innerHTML = `<div class="notif-item muted">${UI.escape(err.message)}</div>`;
      }
    }

    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = panelEl.hidden;
      panelEl.hidden = true;
      if (willOpen) openPanel();
    });

    panelEl.addEventListener('click', (event) => event.stopPropagation());
    document.addEventListener('click', () => {
      panelEl.hidden = true;
    });

    refreshBadge();
  },

  markActiveNav() {
    const here = window.location.pathname;
    document.querySelectorAll('nav.main a').forEach((a) => {
      if (a.getAttribute('href') === here) a.classList.add('active');
    });
  },

  /** Applies whatever theme is already stored (called inline, in <head>, on every page —
   *  see the snippet before the stylesheet link — so the page never flashes the wrong
   *  theme before this file even loads). Safe to call again; it's idempotent. */
  applyStoredTheme() {
    try {
      const stored = localStorage.getItem('splitit-theme');
      if (stored) document.documentElement.setAttribute('data-theme', stored);
    } catch {
      /* localStorage unavailable (private mode, etc.) — falls back to OS preference */
    }
  },

  /** Wires a button to flip between light and dark, persisting the choice. */
  bindThemeToggle(selector) {
    const btn = typeof selector === 'string' ? UI.el(selector) : selector;
    if (!btn) return;

    const paint = () => {
      const dark =
        document.documentElement.getAttribute('data-theme') === 'dark' ||
        (!document.documentElement.getAttribute('data-theme') &&
          window.matchMedia('(prefers-color-scheme: dark)').matches);
      btn.textContent = dark ? '☀️' : '🌙';
    };

    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const isDark = current === 'dark' || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
      const next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try {
        localStorage.setItem('splitit-theme', next);
      } catch {
        /* localStorage unavailable — the toggle still works for this page view */
      }
      paint();
    });

    paint();
  },

  /** A brief confetti burst — used to celebrate a group hitting zero balances. Pure
   *  canvas, no library: this is decorative, not something worth a dependency for. */
  confetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const colors = ['#2b3ad6', '#1c6b53', '#a8402c', '#8a6100', '#7a3ca8', '#2c7a9e'];
    const pieces = Array.from({ length: 140 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.5,
      size: 4 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      speedY: 2 + Math.random() * 3,
      speedX: -2 + Math.random() * 4,
      rotation: Math.random() * Math.PI,
      spin: -0.2 + Math.random() * 0.4
    }));

    const start = performance.now();
    const duration = 2600;

    function frame(now) {
      const elapsed = now - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      pieces.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.rotation += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });

      if (elapsed < duration) {
        requestAnimationFrame(frame);
      } else {
        canvas.remove();
      }
    }

    requestAnimationFrame(frame);
  },

  /** Renders the signature balance beam list into a container. */
  renderBeams(container, rows, currency) {
    if (!rows.length) {
      container.innerHTML = '<p class="empty">No balances yet. Add an expense to start the ledger.</p>';
      return;
    }
    const peak = Math.max(...rows.map((r) => Math.abs(r.amountCents)), 1);
    container.innerHTML = rows
      .map((row) => {
        const width = Math.max((Math.abs(row.amountCents) / peak) * 50, row.amountCents ? 2 : 0);
        const owes = row.amountCents < 0;
        const bar = row.amountCents
          ? `<span class="beam-bar ${owes ? 'owes' : 'owed'}" style="width:${width}%"></span>`
          : '';
        const cls = row.amountCents === 0 ? 'muted' : owes ? 'debit' : 'credit';
        return `
          <div class="beam">
            <span class="beam-name">${UI.escape(row.name || 'Member')}</span>
            <span class="beam-track">${bar}</span>
            <span class="beam-amount ${cls}">${UI.euros(row.amountCents, currency)}</span>
          </div>`;
      })
      .join('');
  }
};

window.UI = UI;
