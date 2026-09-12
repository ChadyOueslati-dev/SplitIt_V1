(async function initDashboard() {
  const user = await UI.requireSession();
  if (!user) return;

  try {
    const data = await API.get('/dashboard');

    document.getElementById('s-owe').textContent = UI.euros(data.youOweCents);
    document.getElementById('s-owed').textContent = UI.euros(data.owedToYouCents);
    document.getElementById('s-groups').textContent = data.groupCount;
    document.getElementById('s-expenses').textContent = data.expenseCount;

    const recent = document.getElementById('recent');
    recent.innerHTML = data.recent.length
      ? data.recent
          .map(
            (e) => `
        <div class="entry">
          <time>${UI.dateTime(e.createdAt)}</time>
          <div>
            <div>${UI.escape(e.summary)}</div>
            <span class="small muted">${UI.escape(e.group ? e.group.name : '')}</span>
          </div>
        </div>`
          )
          .join('')
      : '<p class="empty">Nothing has happened yet. Create a group to start.</p>';

    const { groups } = await API.get('/groups');
    const list = document.getElementById('group-list');
    list.innerHTML = groups.length
      ? groups
          .map((g) => {
            const cls = g.yourBalanceCents < 0 ? 'debit' : g.yourBalanceCents > 0 ? 'credit' : 'muted';
            const label =
              g.yourBalanceCents < 0
                ? 'you owe'
                : g.yourBalanceCents > 0
                  ? 'owed to you'
                  : 'settled';
            return `
        <div class="entry">
          <div style="flex:1">
            <a href="/group.html?id=${g._id}" class="avatar-row" style="display:inline-flex">${UI.groupBadgeHtml(g, 22)}<strong>${UI.escape(g.name)}</strong></a>
            <div class="small muted">${g.members.length} members · ${g.expenseCount} expenses · ${UI.escape(g.category)}</div>
          </div>
          <div style="text-align:right">
            <div class="money ${cls}">${UI.euros(Math.abs(g.yourBalanceCents), g.currency)}</div>
            <div class="small muted">${label}</div>
          </div>
        </div>`;
          })
          .join('')
      : '<p class="empty">No groups yet. <a href="/groups.html">Create your first one.</a></p>';
  } catch (err) {
    UI.notify('#message', err.message);
  }
})();
