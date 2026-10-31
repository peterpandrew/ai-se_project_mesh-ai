import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import app from '../dist/app.js';

let server;
let baseUrl;

before(async () => {
  server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Could not determine the test server address'));
        return;
      }

      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

const endpoints = [
  ['GET /auth/me', 'GET', '/auth/me', 200],
  ['POST /auth/register', 'POST', '/auth/register', 201],
  ['POST /auth/login', 'POST', '/auth/login', 200],
  ['GET /chats', 'GET', '/chats', 200],
  ['POST /chats', 'POST', '/chats', 201],
  ['GET /chats/:id', 'GET', '/chats/chat_001', 200],
  ['DELETE /chats/:id', 'DELETE', '/chats/chat_001', 204],
  [
    'POST /chats/:id/messages',
    'POST',
    '/chats/chat_001/messages',
    201,
  ],
  ['GET /documents', 'GET', '/documents', 200],
  ['POST /documents', 'POST', '/documents', 201],
  ['GET /documents/:id', 'GET', '/documents/document_001', 200],
  ['DELETE /documents/:id', 'DELETE', '/documents/document_001', 204],
  ['POST /query', 'POST', '/query', 200],
];

for (const [name, method, path, expectedStatus] of endpoints) {
  test(name, async () => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      ...(method === 'POST'
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          }
        : {}),
    });

    assert.equal(response.status, expectedStatus);
    const responseText = await response.text();

    if (expectedStatus === 204) {
      assert.equal(responseText, '');
      return;
    }

    const body = JSON.parse(responseText);
    assert.equal(body.success, true);
    assert.equal(typeof body.data, 'object');
    assert.equal(body.error, null);
  });
}

test('unknown routes use the 404 response envelope', async () => {
  const response = await fetch(`${baseUrl}/not-found`);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.match(body.error, /Route GET \/not-found not found/);
});

test('health endpoint returns the standard success envelope', async () => {
  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    success: true,
    data: { status: 'ok' },
    error: null,
  });
});

test('errors use the 500 response envelope', async () => {
  const originalConsoleError = console.error;
  const loggedErrors = [];
  console.error = (...args) => loggedErrors.push(args);

  try {
    const response = await fetch(`${baseUrl}/test-error`);
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.deepEqual(body, {
      success: false,
      data: null,
      error: 'An error has occurred on the server',
    });
    assert.equal(loggedErrors.length, 1);
  } finally {
    console.error = originalConsoleError;
  }
});
