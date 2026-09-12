/* Join a group by code, with or without an account. No session is required to load this page. */

const form = document.getElementById('join-form');
const submit = document.getElementById('join-submit');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  submit.disabled = true;

  try {
    const { groupName } = await API.post('/join-requests', {
      name: form.elements.name.value.trim(),
      code: form.elements.code.value.trim(),
      message: form.elements.message.value.trim()
    });

    form.reset();
    UI.notify(
      '#join-message',
      `Request sent to "${groupName}". You'll get access once an owner approves it.`,
      'success'
    );
    setTimeout(() => (window.location.href = '/dashboard.html'), 1800);
  } catch (err) {
    UI.notify('#join-message', err.message);
    submit.disabled = false;
  }
});
