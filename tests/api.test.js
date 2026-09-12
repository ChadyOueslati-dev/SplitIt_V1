const test = require('node:test');
const assert = require('node:assert');

process.env.JWT_SECRET = 'test-secret';
const app = require('../server');

let server;
let base;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test('the health endpoint answers', async () => {
  const res = await fetch(`${base}/health`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).status, 'ok');
});

test('protected routes reject anonymous callers', async () => {
  const res = await fetch(`${base}/api/groups`);
  assert.strictEqual(res.status, 401);
});

test('validation runs before anything touches the database', async () => {
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'A', email: 'not-an-email', password: 'short' })
  });
  assert.strictEqual(res.status, 400);
});

test('unknown routes return a JSON 404', async () => {
  const res = await fetch(`${base}/api/nope`);
  assert.strictEqual(res.status, 404);
  assert.ok((await res.json()).error);
});

test('joining by code validates the code before anything touches the database', async () => {
  const res = await fetch(`${base}/api/join-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Guest' })
  });
  assert.strictEqual(res.status, 400);
});

test('viewing or deciding join requests requires a session', async () => {
  const list = await fetch(`${base}/api/join-requests/mine`);
  assert.strictEqual(list.status, 401);

  const groupList = await fetch(`${base}/api/groups/64b000000000000000000000/join-requests`);
  assert.strictEqual(groupList.status, 401);
});

test('forgot-password validates the email before anything touches the database or sends mail', async () => {
  const res = await fetch(`${base}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email' })
  });
  assert.strictEqual(res.status, 400);
});

test('reset-password rejects a malformed code before touching the database', async () => {
  const res = await fetch(`${base}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'chady@example.com', code: '12', password: 'short' })
  });
  assert.strictEqual(res.status, 400);
});
