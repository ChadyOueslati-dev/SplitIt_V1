(async function initAccount() {
  const user = await UI.requireSession();
  if (!user) return;

  const avatarPreview = document.getElementById('avatar-preview');
  const avatarFile = document.getElementById('avatar-file');
  const avatarRemove = document.getElementById('avatar-remove');

  function paintAvatar(u) {
    avatarPreview.innerHTML = UI.avatarHtml(u, 72);
    avatarRemove.hidden = !u.avatar;
  }
  paintAvatar(user);

  avatarFile.addEventListener('change', async () => {
    const file = avatarFile.files[0];
    if (!file) return;

    try {
      const image = await UI.resizeImageFile(file);
      const { user: updated } = await API.put('/auth/avatar', { image });
      paintAvatar(updated);
      const headerAvatar = document.getElementById('who-avatar');
      if (headerAvatar) headerAvatar.innerHTML = UI.avatarHtml(updated, 24);
      UI.notify('#avatar-message', 'Photo updated.', 'success');
    } catch (err) {
      UI.notify('#avatar-message', err.message);
    } finally {
      avatarFile.value = '';
    }
  });

  avatarRemove.addEventListener('click', async () => {
    try {
      const { user: updated } = await API.del('/auth/avatar');
      paintAvatar(updated);
      const headerAvatar = document.getElementById('who-avatar');
      if (headerAvatar) headerAvatar.innerHTML = UI.avatarHtml(updated, 24);
      UI.notify('#avatar-message', 'Photo removed.', 'success');
    } catch (err) {
      UI.notify('#avatar-message', err.message);
    }
  });

  const profileForm = document.getElementById('profile-form');
  const upgradeSection = document.getElementById('upgrade-section');
  const upgradeForm = document.getElementById('upgrade-form');
  const passwordSection = document.getElementById('password-section');
  const passwordForm = document.getElementById('password-form');
  const deleteForm = document.getElementById('delete-form');
  const deletePasswordField = document.getElementById('delete-password-field');

  function paintForGuestStatus(isGuest) {
    document.getElementById('guest-notice').hidden = !isGuest;
    upgradeSection.hidden = !isGuest;
    passwordSection.hidden = isGuest;
    deletePasswordField.hidden = isGuest;
  }

  profileForm.elements.name.value = user.name;
  profileForm.elements.currency.value = user.defaultCurrency;
  paintForGuestStatus(user.isGuest);

  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await API.patch('/auth/me', {
        name: profileForm.elements.name.value.trim(),
        defaultCurrency: profileForm.elements.currency.value
      });
      UI.notify('#profile-message', 'Profile updated.', 'success');
    } catch (err) {
      UI.notify('#profile-message', err.message);
    }
  });

  upgradeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await API.post('/auth/upgrade', {
        email: upgradeForm.elements.email.value.trim(),
        password: upgradeForm.elements.password.value
      });
      UI.notify('#upgrade-message', 'Your account is now a full account.', 'success');
      upgradeForm.reset();
      paintForGuestStatus(false);
    } catch (err) {
      UI.notify('#upgrade-message', err.message);
    }
  });

  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await API.post('/auth/change-password', {
        currentPassword: passwordForm.elements.currentPassword.value,
        newPassword: passwordForm.elements.newPassword.value
      });
      passwordForm.reset();
      UI.notify('#password-message', 'Password updated.', 'success');
    } catch (err) {
      UI.notify('#password-message', err.message);
    }
  });

  deleteForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!window.confirm('Delete your account? This cannot be undone.')) return;

    try {
      await API.del('/auth/me', { password: deleteForm.elements.password.value });
      window.location.href = '/';
    } catch (err) {
      UI.notify('#delete-message', err.message);
    }
  });
})();
