(async function initGroups() {
  const user = await UI.requireSession();
  if (!user) return;

  const filters = document.getElementById('filters');
  const list = document.getElementById('group-list');

  async function load() {
    const params = {
      q: filters.elements.q.value.trim(),
      category: filters.elements.category.value,
      archived: filters.elements.archived.value
    };

    try {
      const { groups } = await API.get('/groups', params);
      list.innerHTML = groups.length
        ? groups
            .map((g) => {
              const cls = g.yourBalanceCents < 0 ? 'debit' : g.yourBalanceCents > 0 ? 'credit' : 'muted';
              const members = g.members.map((m) => UI.escape(m.user.name)).join(', ');
              return `
        <article class="card" style="margin-bottom:0.75rem">
          <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap">
            <div>
              <h3 style="margin-bottom:0.2rem"><a href="/group.html?id=${g._id}">${UI.escape(g.name)}</a></h3>
              <span class="tag">${UI.escape(g.category)}</span>
              <span class="tag">${UI.escape(g.currency)}</span>
              ${g.archived ? '<span class="tag wait">archived</span>' : ''}
            </div>
            <div style="text-align:right">
              <div class="money ${cls}">${UI.euros(g.yourBalanceCents, g.currency)}</div>
              <div class="small muted">${g.expenseCount} expenses</div>
            </div>
          </div>
          <p class="small muted" style="margin:0.5rem 0 0">${UI.escape(g.description || 'No description')}</p>
          <p class="small muted" style="margin:0.25rem 0 0">Members: ${members}</p>
          <div style="margin-top:0.75rem;display:flex;gap:0.5rem">
            <a class="btn ghost" href="/group.html?id=${g._id}">Open</a>
            <button class="quiet" data-archive="${g._id}" data-state="${g.archived}">
              ${g.archived ? 'Restore' : 'Archive'}
            </button>
          </div>
        </article>`;
            })
            .join('')
        : '<p class="empty">No groups match that filter.</p>';

      list.querySelectorAll('[data-archive]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await API.patch(`/groups/${btn.dataset.archive}`, { archived: btn.dataset.state !== 'true' });
          load();
        });
      });
    } catch (err) {
      UI.notify('#message', err.message);
    }
  }

  filters.addEventListener('submit', (e) => {
    e.preventDefault();
    load();
  });
  filters.addEventListener('reset', () => setTimeout(load, 0));

  const form = document.getElementById('new-group');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const emails = form.elements.memberEmails.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const { unknownEmails } = await API.post('/groups', {
        name: form.elements.name.value.trim(),
        description: form.elements.description.value.trim(),
        category: form.elements.category.value,
        currency: form.elements.currency.value,
        memberEmails: emails
      });

      form.reset();
      UI.notify(
        '#new-group-message',
        unknownEmails.length
          ? `Group created. No account yet for: ${unknownEmails.join(', ')}`
          : 'Group created.',
        'success'
      );
      load();
    } catch (err) {
      UI.notify('#new-group-message', err.message);
    }
  });

  load();
})();
