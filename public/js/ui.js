/* Shared helpers: formatting, DOM shortcuts, session guard, balance beams. */

const UI = {
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
      return user;
    } catch {
      window.location.href = `/auth.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return null;
    }
  },

  bindLogout() {
    const btn = UI.el('#logout');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      await API.post('/auth/logout');
      window.location.href = '/';
    });
  },

  markActiveNav() {
    const here = window.location.pathname;
    document.querySelectorAll('nav.main a').forEach((a) => {
      if (a.getAttribute('href') === here) a.classList.add('active');
    });
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
