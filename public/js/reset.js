/* Forgot password: request an emailed code, then use it to set a new password. */

const requestForm = document.getElementById('request-form');
const confirmForm = document.getElementById('confirm-form');
const blurb = document.getElementById('step-blurb');

let email = '';

requestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = document.getElementById('request-submit');
  submit.disabled = true;

  email = requestForm.elements.email.value.trim();

  try {
    const { message } = await API.post('/auth/forgot-password', { email });
    UI.notify('#reset-message', message, 'success');
    blurb.textContent = `Enter the code sent to ${email}, and your new password.`;
    requestForm.hidden = true;
    confirmForm.hidden = false;
    document.getElementById('code').focus();
  } catch (err) {
    UI.notify('#reset-message', err.message);
  } finally {
    submit.disabled = false;
  }
});

confirmForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = document.getElementById('confirm-submit');
  submit.disabled = true;

  try {
    await API.post('/auth/reset-password', {
      email,
      code: confirmForm.elements.code.value.trim(),
      password: confirmForm.elements.password.value
    });
    UI.notify('#reset-message', 'Password updated. Taking you to your dashboard…', 'success');
    setTimeout(() => (window.location.href = '/dashboard.html'), 1200);
  } catch (err) {
    UI.notify('#reset-message', err.message);
    submit.disabled = false;
  }
});

document.getElementById('use-different-email').addEventListener('click', () => {
  confirmForm.hidden = true;
  confirmForm.reset();
  requestForm.hidden = false;
  blurb.textContent = "Enter the email on your account and we'll send you a code.";
});
