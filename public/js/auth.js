/* Sign in / create account. One form, two modes. */

const params = new URLSearchParams(window.location.search);
let mode = params.get('mode') === 'register' ? 'register' : 'login';

const form = document.getElementById('auth-form');
const nameField = document.getElementById('name-field');
const title = document.getElementById('auth-title');
const blurb = document.getElementById('auth-blurb');
const toggle = document.getElementById('auth-toggle');
const submit = document.getElementById('auth-submit');
const forgotLink = document.getElementById('forgot-link');

function paint() {
  const registering = mode === 'register';
  title.textContent = registering ? 'Create your account' : 'Sign in';
  blurb.textContent = registering
    ? 'You need an account before you can be added to a group.'
    : 'Pick up where your groups left off.';
  nameField.hidden = !registering;
  submit.textContent = registering ? 'Create account' : 'Sign in';
  toggle.textContent = registering ? 'Already have an account? Sign in' : 'New here? Create an account';
  forgotLink.hidden = registering;
}

toggle.addEventListener('click', () => {
  mode = mode === 'register' ? 'login' : 'register';
  paint();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  submit.disabled = true;

  const payload = {
    email: form.elements.email.value.trim(),
    password: form.elements.password.value
  };
  if (mode === 'register') {
    payload.name = form.elements.name.value.trim();
    payload.defaultCurrency = form.elements.currency.value;
  }

  try {
    await API.post(mode === 'register' ? '/auth/register' : '/auth/login', payload);
    window.location.href = params.get('next') || '/dashboard.html';
  } catch (err) {
    UI.notify('#auth-message', err.message);
    submit.disabled = false;
  }
});

paint();
