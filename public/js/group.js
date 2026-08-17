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
    document.getElementById('group-category').textContent = `${group.category} · ${group.currency}`;
    document.getElementById('group-description').textContent = group.description || '';
    document.getElementById('s-members').textContent = group.members.length;
    document.title = `${group.name} — SplitIt`;

    memberOptions(document.getElementById('paidBy'), true, 'Anyone');
    memberOptions(document.getElementById('new-paidBy'), false);
    document.getElementById('new-paidBy').value = user.id;

    document.getElementById('participants').innerHTML = group.members
      .map(
        (m) => `<label><input type="checkbox" value="${m.user._id}" checked /> ${UI.escape(m.user.name)}</label>`
      )
      .join('');

    document.getElementById('spentAt').value = new Date().toISOString().slice(0, 10);
  }

  async function loadBalances() {
    const data = await API.get(`/groups/${groupId}/balances`);

    document.getElementById('s-total').textContent = UI.euros(data.totalSpentCents, data.currency);
    const mine = data.balances.find((b) => b.user === String(user.id));
    const yours = document.getElementById('s-yours');
    yours.textContent = UI.euros(mine ? mine.amountCents : 0, data.currency);
    yours.className = `value ${mine && mine.amountCents < 0 ? 'debit' : 'credit'}`;

    UI.renderBeams(document.getElementById('beams'), data.balances, data.currency);

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
          <td class="small">${UI.escape(e.paidBy.name)}</td>
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

  try {
    await loadGroup();
    await refresh();
  } catch (err) {
    UI.notify('#message', err.message);
  }
})();
