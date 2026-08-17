(async function initSettle() {
  const user = await UI.requireSession();
  if (!user) return;

  const groupSelect = document.getElementById('group');
  const toSelect = document.getElementById('to');
  const payForm = document.getElementById('pay');
  const cardField = document.getElementById('card-field');

  let groups = [];

  async function loadGroups() {
    const data = await API.get('/groups');
    groups = data.groups;
    if (!groups.length) {
      UI.notify('#message', 'Join or create a group before settling up.', 'error');
      return;
    }
    groupSelect.innerHTML = groups
      .map((g) => `<option value="${g._id}">${UI.escape(g.name)}</option>`)
      .join('');
  }

  function currentGroup() {
    return groups.find((g) => g._id === groupSelect.value);
  }

  async function loadTransfers() {
    const group = currentGroup();
    if (!group) return;

    const data = await API.get(`/groups/${group._id}/settlement-suggestions`);
    const yours = data.transfers.filter((t) => t.isYours);

    document.getElementById('transfers').innerHTML = data.transfers.length
      ? data.transfers
          .map(
            (t) => `
        <div class="entry">
          <div style="flex:1">
            ${UI.escape(t.fromName)} <span class="muted">pays</span> ${UI.escape(t.toName)}
            ${t.isYours ? '<span class="tag bad">yours</span>' : ''}
          </div>
          <div class="money">${UI.euros(t.amountCents, data.currency)}</div>
        </div>`
          )
          .join('')
      : '<p class="empty">This group is fully settled.</p>';

    toSelect.innerHTML = group.members
      .filter((m) => String(m.user._id) !== String(user.id))
      .map((m) => `<option value="${m.user._id}">${UI.escape(m.user.name)}</option>`)
      .join('');

    // Pre-fill with the payment SplitIt actually recommends for this user.
    if (yours.length) {
      toSelect.value = yours[0].to;
      payForm.elements.amount.value = UI.plain(yours[0].amountCents);
    } else {
      payForm.elements.amount.value = '';
    }
  }

  async function loadHistory() {
    const data = await API.get('/settlements', { groupId: groupSelect.value });
    const statusTag = { completed: 'ok', failed: 'bad', processing: 'wait', pending: 'wait' };

    document.getElementById('history-rows').innerHTML = data.settlements
      .map(
        (s) => `
      <tr>
        <td class="small">${UI.dateTime(s.createdAt)}</td>
        <td class="small">${UI.escape(s.group ? s.group.name : '')}</td>
        <td class="small">${UI.escape(s.from.name)}</td>
        <td class="small">${UI.escape(s.to.name)}</td>
        <td class="small money">${UI.escape(s.reference)}</td>
        <td><span class="tag ${statusTag[s.status]}">${UI.escape(s.status)}</span>
          ${s.failureReason ? `<div class="small debit">${UI.escape(s.failureReason)}</div>` : ''}</td>
        <td class="money" style="text-align:right">${UI.euros(s.amountCents, s.currency)}</td>
      </tr>`
      )
      .join('');

    document.getElementById('history-empty').innerHTML = data.settlements.length
      ? ''
      : '<p class="empty">No payments in this group yet.</p>';
  }

  groupSelect.addEventListener('change', async () => {
    await loadTransfers();
    await loadHistory();
  });

  payForm.elements.method.addEventListener('change', () => {
    cardField.hidden = payForm.elements.method.value !== 'mock-card';
  });

  payForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = document.getElementById('pay-submit');
    submit.disabled = true;
    submit.textContent = 'Processing';

    try {
      const { settlement } = await API.post('/settlements', {
        groupId: groupSelect.value,
        to: toSelect.value,
        amount: payForm.elements.amount.value,
        method: payForm.elements.method.value,
        cardNumber: payForm.elements.cardNumber.value
      });

      UI.notify(
        '#pay-message',
        `Paid ${UI.euros(settlement.amountCents, settlement.currency)}. Reference ${settlement.reference}.`,
        'success'
      );
      await loadTransfers();
      await loadHistory();
    } catch (err) {
      UI.notify('#pay-message', err.message);
      await loadHistory();
    } finally {
      submit.disabled = false;
      submit.textContent = 'Pay now';
    }
  });

  try {
    await loadGroups();
    if (UI.query('group')) groupSelect.value = UI.query('group');
    await loadTransfers();
    await loadHistory();
  } catch (err) {
    UI.notify('#message', err.message);
  }
})();
