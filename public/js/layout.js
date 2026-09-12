/* Renders the signed-in header on every app page so the nav stays in one place. */

(function renderHeader() {
  const mount = document.getElementById('app-header');
  if (!mount) return;

  mount.innerHTML = `
    <header class="topbar">
      <div class="topbar-inner">
        <a class="brand" href="/dashboard.html">Split<span>It</span></a>
        <nav class="main">
          <a href="/dashboard.html">Dashboard</a>
          <a href="/groups.html">Groups</a>
          <a href="/settle.html">Settle up</a>
          <a href="/activity.html">Activity</a>
          <a href="/account.html">Account</a>
          <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Toggle dark mode"></button>
          <div class="notif-wrap">
            <button class="icon-btn" id="notif-bell" type="button" aria-label="Notifications">
              ${UI.icons.bell}
              <span class="notif-badge" id="notif-badge" hidden></span>
            </button>
            <div class="notif-panel" id="notif-panel" hidden>
              <div class="notif-panel-head">Notifications</div>
              <div id="notif-list"></div>
            </div>
          </div>
          <span class="avatar-row">
            <span id="who-avatar"></span>
            <span class="small muted" id="who"></span>
          </span>
          <button class="icon-btn" id="logout" type="button" aria-label="Sign out" title="Sign out">${UI.icons.signOut}</button>
        </nav>
      </div>
    </header>`;

  UI.markActiveNav();
  UI.bindLogout();
  UI.bindThemeToggle('#theme-toggle');
  UI.bindNotifications();

  // Anyone with a pending or recently-decided join request sees it here, on every page,
  // since a guest waiting on approval has no group to look at yet.
  (async () => {
    try {
      const { joinRequests } = await API.get('/join-requests/mine');
      const pending = joinRequests.filter((r) => r.status === 'pending');
      if (!pending.length) return;

      const banner = document.createElement('div');
      banner.className = 'wrap';
      banner.style.marginTop = '1rem';
      banner.innerHTML = pending
        .map(
          (r) =>
            `<div class="notice">Waiting on an owner to approve your request to join "${UI.escape(
              r.groupName
            )}".</div>`
        )
        .join('');
      mount.after(banner);
    } catch {
      /* not signed in, or nothing to show */
    }
  })();
})();
