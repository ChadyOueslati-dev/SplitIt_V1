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
          <span class="small muted" id="who"></span>
          <button class="quiet" id="logout" type="button">Sign out</button>
        </nav>
      </div>
    </header>`;

  UI.markActiveNav();
  UI.bindLogout();
})();
