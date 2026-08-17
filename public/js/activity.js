(async function initActivity() {
  const user = await UI.requireSession();
  if (!user) return;

  const filters = document.getElementById('filters');
  const entries = document.getElementById('entries');
  let page = 1;
  let pages = 1;

  async function loadGroupOptions() {
    const { groups } = await API.get('/groups');
    filters.elements.groupId.innerHTML =
      '<option value="">All groups</option>' +
      groups.map((g) => `<option value="${g._id}">${UI.escape(g.name)}</option>`).join('');
  }

  async function load() {
    try {
      const data = await API.get('/activity', {
        groupId: filters.elements.groupId.value,
        action: filters.elements.action.value,
        page
      });
      pages = data.pages;

      document.getElementById('page-label').textContent = `Page ${data.page} of ${data.pages} · ${data.total} events`;
      document.getElementById('prev').disabled = data.page <= 1;
      document.getElementById('next').disabled = data.page >= data.pages;

      entries.innerHTML = data.entries.length
        ? data.entries
            .map(
              (e) => `
        <div class="entry">
          <time>${UI.dateTime(e.createdAt)}</time>
          <div style="flex:1">
            <div>${UI.escape(e.summary)}</div>
            <span class="small muted">${UI.escape(e.group ? e.group.name : 'No group')}</span>
          </div>
          <span class="tag">${UI.escape(e.action.replace('.', ' '))}</span>
        </div>`
            )
            .join('')
        : '<p class="empty">Nothing recorded for this filter.</p>';
    } catch (err) {
      UI.notify('#message', err.message);
    }
  }

  filters.addEventListener('submit', (e) => {
    e.preventDefault();
    page = 1;
    load();
  });
  filters.addEventListener('reset', () => {
    page = 1;
    setTimeout(load, 0);
  });

  document.getElementById('prev').addEventListener('click', () => {
    if (page > 1) {
      page -= 1;
      load();
    }
  });
  document.getElementById('next').addEventListener('click', () => {
    if (page < pages) {
      page += 1;
      load();
    }
  });

  await loadGroupOptions();
  await load();
})();
