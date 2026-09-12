(async function initGroup() {
  const user = await UI.requireSession();
  if (!user) return;

  const groupId = UI.query('id');
  if (!groupId) {
    window.location.href = '/groups.html';
    return;
  }

  let group;
  let page = 1;
  let pages = 1;

  const filters = document.getElementById('filters');
  const rows = document.getElementById('expense-rows');

  function memberOptions(select, includeAll, allLabel) {
    select.innerHTML =
      (includeAll ? `<option value="">${allLabel}</option>` : '') +
      group.members
        .map((m) => `<option value="${m.user._id}">${UI.escape(m.user.name)}</option>`)
        .join('');
  }

  async function loadGroup() {
    const data = await API.get(`/groups/${groupId}`);
    group = data.group;

    document.getElementById('group-name').textContent = group.name;
    document.getElementById('group-badge').innerHTML = UI.groupBadgeHtml(group, 36);
    paintGroupPhoto();
    document.getElementById('group-category').textContent = `${group.category} · ${group.currency}`;
    document.getElementById('group-description').textContent = group.description || '';
    document.getElementById('s-members').textContent = group.members.length;
    document.title = `${group.name} — SplitIt`;
    paintEditForm();

    memberOptions(document.getElementById('paidBy'), true, 'Anyone');
    memberOptions(document.getElementById('new-paidBy'), false);
    document.getElementById('new-paidBy').value = user.id;

    document.getElementById('participants').innerHTML = group.members
      .map(
        (m) =>
          `<label><input type="checkbox" value="${m.user._id}" checked /> ${UI.avatarHtml(m.user, 18)} ${UI.escape(m.user.name)}</label>`
      )
      .join('');

    document.getElementById('spentAt').value = new Date().toISOString().slice(0, 10);
  }

  function paintGroupPhoto() {
    document.getElementById('group-photo-preview').innerHTML = UI.groupBadgeHtml(group, 96);
    document.getElementById('group-photo-remove').hidden = !group.photo;
  }

  function paintEditForm() {
    const form = document.getElementById('edit-group');
    form.elements.name.value = group.name;
    form.elements.description.value = group.description || '';
    form.elements.category.value = group.category;
    form.elements.currency.value = group.currency;
    document.getElementById('edit-icon').value = group.icon || '🧾';
  }

  function isOwner() {
    const me = group.members.find((m) => String(m.user._id) === String(user.id));
    return !!me && me.role === 'owner';
  }

  function loadJoinCode() {
    document.getElementById('join-url').textContent = `${window.location.origin}/join.html`;
    document.getElementById('join-code').textContent = group.joinCode || '—';
    document.getElementById('regenerate-code').hidden = !isOwner();
  }

  async function decideJoinRequest(requestId, decision) {
    try {
      await API.post(`/groups/${groupId}/join-requests/${requestId}/decide`, { decision });
      await loadGroup();
      loadJoinCode();
      await loadJoinRequests();
      refresh();
    } catch (err) {
      UI.notify('#message', err.message);
    }
  }

  async function loadJoinRequests() {
    const card = document.getElementById('join-requests-card');
    if (!isOwner()) {
      card.hidden = true;
      return;
    }

    const { joinRequests } = await API.get(`/groups/${groupId}/join-requests`);
    const list = document.getElementById('join-requests');
    card.hidden = joinRequests.length === 0;

    list.innerHTML = joinRequests
      .map(
        (r) => `
      <div class="entry" style="align-items: flex-start">
        <div style="flex: 1" class="avatar-row">
          ${UI.avatarHtml(r.user, 22)}
          <div>
            <strong>${UI.escape(r.user.name)}</strong>
            ${r.message ? `<div class="small muted">${UI.escape(r.message)}</div>` : ''}
          </div>
        </div>
        <div style="display: flex; gap: 0.4rem">
          <button data-approve="${r._id}">Approve</button>
          <button class="quiet" data-decline="${r._id}">Decline</button>
        </div>
      </div>`
      )
      .join('');

    list.querySelectorAll('[data-approve]').forEach((btn) => {
      btn.addEventListener('click', () => decideJoinRequest(btn.dataset.approve, 'approve'));
    });
    list.querySelectorAll('[data-decline]').forEach((btn) => {
      btn.addEventListener('click', () => decideJoinRequest(btn.dataset.decline, 'decline'));
    });
  }

  /** Fires the confetti burst once per time a group *newly* reaches all-zero balances —
   *  not on every reload once it's already settled, and ready to fire again if a new
   *  expense knocks it back out of balance and it later resettles. */
  function celebrateIfSettled(data) {
    const flagKey = `splitit-settled-${groupId}`;
    const allSettled = data.totalSpentCents > 0 && data.balances.every((b) => b.amountCents === 0);

    try {
      if (allSettled) {
        if (sessionStorage.getItem(flagKey) !== 'shown') {
          UI.confetti();
          sessionStorage.setItem(flagKey, 'shown');
        }
      } else {
        sessionStorage.removeItem(flagKey);
      }
    } catch {
      if (allSettled) UI.confetti();
    }
  }

  async function loadBalances() {
    const data = await API.get(`/groups/${groupId}/balances`);

    document.getElementById('s-total').textContent = UI.euros(data.totalSpentCents, data.currency);
    const mine = data.balances.find((b) => b.user === String(user.id));
    const yours = document.getElementById('s-yours');
    yours.textContent = UI.euros(mine ? mine.amountCents : 0, data.currency);
    yours.className = `value ${mine && mine.amountCents < 0 ? 'debit' : 'credit'}`;

    UI.renderBeams(document.getElementById('beams'), data.balances, data.currency);
    celebrateIfSettled(data);

    const transfers = document.getElementById('transfers');
    transfers.innerHTML = data.transfers.length
      ? data.transfers
          .map(
            (t) => `
        <div class="entry">
          <div style="flex:1">${UI.escape(t.fromName)} <span class="muted">pays</span> ${UI.escape(t.toName)}</div>
          <div class="money">${UI.euros(t.amountCents, data.currency)}</div>
        </div>`
          )
          .join('')
      : '<p class="empty">Everyone is square.</p>';
  }

  async function loadExpenses() {
    const params = {
      q: filters.elements.q.value.trim(),
      category: filters.elements.category.value,
      paidBy: filters.elements.paidBy.value,
      min: filters.elements.min.value,
      max: filters.elements.max.value,
      page
    };

    const data = await API.get(`/groups/${groupId}/expenses`, params);
    pages = data.pages;

    document.getElementById('expense-count').textContent = `${data.total} total`;
    document.getElementById('page-label').textContent = `Page ${data.page} of ${data.pages}`;
    document.getElementById('prev').disabled = data.page <= 1;
    document.getElementById('next').disabled = data.page >= data.pages;

    rows.innerHTML = data.expenses
      .map((e) => {
        const share = e.shares.find((s) => String(s.user._id || s.user) === String(user.id));
        return `
        <tr>
          <td class="small">${UI.date(e.spentAt)}</td>
          <td>
            <strong>${UI.escape(e.description)}</strong>
            <div class="small muted">${UI.escape(e.category)}${e.note ? ` · ${UI.escape(e.note)}` : ''}</div>
          </td>
          <td class="small">${UI.avatarHtml(e.paidBy, 18)} ${UI.escape(e.paidBy.name)}</td>
          <td class="money small">${share ? UI.euros(share.amountCents, e.currency) : '—'}</td>
          <td class="money" style="text-align:right">${UI.euros(e.amountCents, e.currency)}</td>
          <td style="text-align:right;white-space:nowrap">
            <button class="quiet" data-edit="${e._id}" data-amount="${UI.plain(e.amountCents)}">Edit</button>
            <button class="quiet" data-delete="${e._id}">Delete</button>
          </td>
        </tr>`;
      })
      .join('');

    document.getElementById('expense-empty').innerHTML = data.expenses.length
      ? ''
      : '<p class="empty">No expenses match this filter.</p>';

    rows.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!window.confirm('Delete this expense? The balances will change.')) return;
        await API.del(`/expenses/${btn.dataset.delete}`);
        refresh();
      });
    });

    rows.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const next = window.prompt('New amount', btn.dataset.amount);
        if (next === null) return;
        try {
          await API.patch(`/expenses/${btn.dataset.edit}`, { amount: next });
          refresh();
        } catch (err) {
          UI.notify('#message', err.message);
        }
      });
    });
  }

  async function refresh() {
    try {
      await Promise.all([loadBalances(), loadExpenses()]);
    } catch (err) {
      UI.notify('#message', err.message);
    }
  }

  filters.addEventListener('submit', (e) => {
    e.preventDefault();
    page = 1;
    loadExpenses();
  });
  filters.addEventListener('reset', () => {
    page = 1;
    setTimeout(loadExpenses, 0);
  });

  document.getElementById('prev').addEventListener('click', () => {
    if (page > 1) {
      page -= 1;
      loadExpenses();
    }
  });
  document.getElementById('next').addEventListener('click', () => {
    if (page < pages) {
      page += 1;
      loadExpenses();
    }
  });

  const expenseForm = document.getElementById('new-expense');
  expenseForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const participants = [...document.querySelectorAll('#participants input:checked')].map((i) => i.value);
    if (!participants.length) {
      UI.notify('#new-expense-message', 'Pick at least one person to split between.');
      return;
    }

    try {
      await API.post(`/groups/${groupId}/expenses`, {
        description: expenseForm.elements.description.value.trim(),
        amount: expenseForm.elements.amount.value,
        category: expenseForm.elements.category.value,
        paidBy: document.getElementById('new-paidBy').value,
        spentAt: expenseForm.elements.spentAt.value,
        note: expenseForm.elements.note.value.trim(),
        splitMethod: 'equal',
        participants
      });

      expenseForm.reset();
      document.getElementById('spentAt').value = new Date().toISOString().slice(0, 10);
      document.querySelectorAll('#participants input').forEach((i) => (i.checked = true));
      UI.notify('#new-expense-message', 'Expense added.', 'success');
      refresh();
    } catch (err) {
      UI.notify('#new-expense-message', err.message);
    }
  });

  document.getElementById('add-member').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await API.post(`/groups/${groupId}/members`, {
        email: document.getElementById('member-email').value.trim()
      });
      document.getElementById('member-email').value = '';
      UI.notify('#member-message', 'Member added.', 'success');
      await loadGroup();
      refresh();
    } catch (err) {
      UI.notify('#member-message', err.message);
    }
  });

  document.getElementById('export-csv').addEventListener('click', () => {
    const params = new URLSearchParams();
    const values = {
      q: filters.elements.q.value.trim(),
      category: filters.elements.category.value,
      paidBy: filters.elements.paidBy.value,
      min: filters.elements.min.value,
      max: filters.elements.max.value
    };
    Object.entries(values).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    window.location.href = `/api/groups/${groupId}/expenses/export?${params.toString()}`;
  });

  document.getElementById('group-photo-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const image = await UI.resizeImageFile(file);
      const { group: updated } = await API.put(`/groups/${groupId}/photo`, { image });
      group.photo = updated.photo;
      paintGroupPhoto();
      UI.notify('#group-photo-message', 'Photo updated.', 'success');
    } catch (err) {
      UI.notify('#group-photo-message', err.message);
    } finally {
      event.target.value = '';
    }
  });

  document.getElementById('group-photo-remove').addEventListener('click', async () => {
    try {
      const { group: updated } = await API.del(`/groups/${groupId}/photo`);
      group.photo = updated.photo;
      paintGroupPhoto();
      UI.notify('#group-photo-message', 'Photo removed.', 'success');
    } catch (err) {
      UI.notify('#group-photo-message', err.message);
    }
  });

  document.querySelectorAll('#edit-icon-picker [data-icon]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('edit-icon').value = btn.dataset.icon;
    });
  });

  document.getElementById('edit-group').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    try {
      const { group: updated } = await API.patch(`/groups/${groupId}`, {
        name: form.elements.name.value.trim(),
        description: form.elements.description.value.trim(),
        category: form.elements.category.value,
        currency: form.elements.currency.value.trim(),
        icon: document.getElementById('edit-icon').value.trim()
      });
      group.name = updated.name;
      group.description = updated.description;
      group.category = updated.category;
      group.currency = updated.currency;
      group.icon = updated.icon;
      document.getElementById('group-name').textContent = group.name;
      document.getElementById('group-badge').innerHTML = UI.groupBadgeHtml(group, 36);
      document.getElementById('group-category').textContent = `${group.category} · ${group.currency}`;
      document.getElementById('group-description').textContent = group.description || '';
      document.title = `${group.name} — SplitIt`;
      paintGroupPhoto();
      UI.notify('#edit-group-message', 'Group updated.', 'success');
    } catch (err) {
      UI.notify('#edit-group-message', err.message);
    }
  });

  document.getElementById('copy-code').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(group.joinCode);
      UI.notify('#join-code-message', 'Copied.', 'success');
    } catch {
      UI.notify('#join-code-message', 'Could not copy — select and copy the code manually.');
    }
  });

  document.getElementById('regenerate-code').addEventListener('click', async () => {
    if (!window.confirm('Generate a new code? The old one will stop working.')) return;
    try {
      const { joinCode } = await API.post(`/groups/${groupId}/join-code/regenerate`);
      group.joinCode = joinCode;
      document.getElementById('join-code').textContent = joinCode;
      UI.notify('#join-code-message', 'New code generated.', 'success');
    } catch (err) {
      UI.notify('#join-code-message', err.message);
    }
  });

  try {
    await loadGroup();
    await refresh();
    loadJoinCode();
    await loadJoinRequests();
  } catch (err) {
    UI.notify('#message', err.message);
  }
})();
