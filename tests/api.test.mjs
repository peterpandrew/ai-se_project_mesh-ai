import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../dist/app.js';
import Chat from '../dist/models/chat.js';
import Chunk from '../dist/models/chunk.js';
import Document from '../dist/models/document.js';
import Message from '../dist/models/message.js';
import User from '../dist/models/user.js';
import { chunkText } from '../dist/utils/chunk.js';
import {
  buildContext,
  getClient,
} from '../dist/utils/openai-client.js';

const testJwtSecret = 'test-jwt-secret';
const createPdf = (text) => {
  const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  const parts = ['%PDF-1.4\n'];
  const offsets = [];

  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(parts.join('')));
    parts.push(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`);
  }

  const xrefOffset = Buffer.byteLength(parts.join(''));
  parts.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets) {
    parts.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
  }
  parts.push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  return Buffer.from(parts.join(''));
};
let originalJwtSecret;
let server;
let baseUrl;

before(async () => {
  originalJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = testJwtSecret;
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
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

const endpoints = [
  ['GET /auth/me', 'GET', '/auth/me', 200],
  ['POST /auth/register', 'POST', '/auth/register', 400],
  ['POST /auth/login', 'POST', '/auth/login', 400],
  ['POST /chats without title', 'POST', '/chats', 400],
  ['DELETE /chats/:id', 'DELETE', '/chats/chat_001', 204],
  [
    'POST /chats/:id/messages without content',
    'POST',
    '/chats/chat_001/messages',
    400,
  ],
  ['POST /documents without a file', 'POST', '/documents', 400],
  ['GET /documents/:id', 'GET', '/documents/document_001', 200],
  ['DELETE /documents/:id', 'DELETE', '/documents/document_001', 204],
  ['POST /query without a question', 'POST', '/query', 400],
];

for (const [name, method, path, expectedStatus] of endpoints) {
  test(name, async () => {
    const headers = {};
    if (
      path.startsWith('/chats') ||
      path.startsWith('/documents') ||
      path.startsWith('/query')
    ) {
      headers.Authorization = `Bearer ${jwt.sign(
        { userId: 'user_001' },
        testJwtSecret,
      )}`;
    }
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      ...(method === 'POST'
        ? {
            headers,
            body: '{}',
          }
        : { headers }),
    });

    assert.equal(response.status, expectedStatus);
    const responseText = await response.text();

    if (expectedStatus === 204) {
      assert.equal(responseText, '');
      return;
    }

    const body = JSON.parse(responseText);
    if (expectedStatus === 400) {
      assert.equal(body.success, false);
      assert.equal(body.data, null);
      assert.equal(typeof body.error, 'string');
      return;
    }

    assert.equal(body.success, true);
    assert.equal(typeof body.data, 'object');
    assert.equal(body.error, null);
  });
}

test('protected resources reject missing and invalid bearer tokens', async () => {
  const protectedEndpoints = [
    ['GET', '/chats'],
    ['GET', '/documents'],
    ['POST', '/query'],
  ];

  for (const [method, path] of protectedEndpoints) {
    for (const authorization of [undefined, 'Bearer invalid-token']) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        ...(method === 'POST'
          ? {
              headers: {
                'Content-Type': 'application/json',
                ...(authorization ? { Authorization: authorization } : {}),
              },
              body: '{}',
            }
          : authorization
            ? { headers: { Authorization: authorization } }
            : {}),
      });
      const body = await response.json();

      assert.equal(response.status, 401);
      assert.equal(body.success, false);
      assert.equal(body.data, null);
      assert.equal(body.error, 'Authentication required');
    }
  }
});

test('createChat stores and returns a chat for the logged-in user', async () => {
  const originalCreate = Chat.create;
  let createdChat;
  Chat.create = async (chat) => {
    createdChat = chat;
    return { _id: 'chat_001', ...chat };
  };

  try {
    const response = await fetch(`${baseUrl}/chats`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt.sign(
          { userId: 'user_001' },
          testJwtSecret,
        )}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Support chat' }),
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.deepEqual(createdChat, {
      title: 'Support chat',
      userId: 'user_001',
    });
    assert.deepEqual(body.data, {
      _id: 'chat_001',
      title: 'Support chat',
      userId: 'user_001',
    });
  } finally {
    Chat.create = originalCreate;
  }
});

test('getChats returns chats filtered by the logged-in user', async () => {
  const originalFind = Chat.find;
  const chats = [{ _id: 'chat_001', title: 'Support chat' }];
  Chat.find = async (filter) => {
    assert.deepEqual(filter, { userId: 'user_001' });
    return chats;
  };

  try {
    const response = await fetch(`${baseUrl}/chats`, {
      headers: {
        Authorization: `Bearer ${jwt.sign(
          { userId: 'user_001' },
          testJwtSecret,
        )}`,
      },
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.data, chats);
  } finally {
    Chat.find = originalFind;
  }
});

test('getChat returns an owned chat with messages sorted by creation time', async () => {
  const originalFindOne = Chat.findOne;
  const originalMessageFind = Message.find;
  const chat = { _id: 'chat_001', title: 'Support chat' };
  const messages = [{ _id: 'message_001', content: 'Hello' }];
  Chat.findOne = async (filter) => {
    assert.deepEqual(filter, { _id: 'chat_001', userId: 'user_001' });
    return chat;
  };
  Message.find = (filter) => {
    assert.deepEqual(filter, { chatId: 'chat_001' });
    return {
      sort: async (sort) => {
        assert.deepEqual(sort, { createdAt: 1 });
        return messages;
      },
    };
  };

  try {
    const response = await fetch(`${baseUrl}/chats/chat_001`, {
      headers: {
        Authorization: `Bearer ${jwt.sign(
          { userId: 'user_001' },
          testJwtSecret,
        )}`,
      },
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.data, { chat, messages });
  } finally {
    Chat.findOne = originalFindOne;
    Message.find = originalMessageFind;
  }
});

test('getChat returns 404 when the chat is not owned by the user', async () => {
  const originalFindOne = Chat.findOne;
  const originalMessageFind = Message.find;
  Chat.findOne = async () => null;
  Message.find = () => {
    throw new Error('Messages should not be queried when the chat is missing');
  };

  try {
    const response = await fetch(`${baseUrl}/chats/chat_001`, {
      headers: {
        Authorization: `Bearer ${jwt.sign(
          { userId: 'user_001' },
          testJwtSecret,
        )}`,
      },
    });
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.deepEqual(body, {
      success: false,
      data: null,
      error: 'Chat not found',
    });
  } finally {
    Chat.findOne = originalFindOne;
    Message.find = originalMessageFind;
  }
});

test('createChatMessage persists the exchange returned by getChat', async () => {
  const originalChatFindOne = Chat.findOne;
  const originalMessageFind = Message.find;
  const originalMessageCreate = Message.create;
  const originalApiKey = process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY = 'test-nebius-key';
  const client = getClient();
  const originalCompletionCreate = client.chat.completions.create;
  const chat = { _id: 'chat_001', title: 'Support chat' };
  const storedMessages = [];
  Chat.findOne = async (filter) => {
    assert.deepEqual(filter, { _id: 'chat_001', userId: 'user_001' });
    return chat;
  };
  Message.find = (filter) => {
    assert.deepEqual(filter, { chatId: 'chat_001' });
    return {
      sort: async () => [...storedMessages].sort(
        (left, right) => left.createdAt - right.createdAt,
      ),
    };
  };
  Message.create = async (message) => {
    const savedMessage = {
      _id: `message_${storedMessages.length + 1}`,
      ...message,
      createdAt: new Date(storedMessages.length),
    };
    storedMessages.push(savedMessage);
    return savedMessage;
  };
  client.chat.completions.create = async () => ({
    choices: [{ message: { content: 'How can I help?' } }],
  });

  try {
    const authorization = `Bearer ${jwt.sign(
      { userId: 'user_001' },
      testJwtSecret,
    )}`;
    const messageResponse = await fetch(
      `${baseUrl}/chats/chat_001/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: 'I need help.' }),
      },
    );
    const messageBody = await messageResponse.json();

    assert.equal(messageResponse.status, 201);
    assert.equal(messageBody.data.userMessage.content, 'I need help.');
    assert.equal(messageBody.data.assistantMessage.content, 'How can I help?');

    const chatResponse = await fetch(`${baseUrl}/chats/chat_001`, {
      headers: { Authorization: authorization },
    });
    const chatBody = await chatResponse.json();

    assert.equal(chatResponse.status, 200);
    assert.deepEqual(
      chatBody.data.messages.map(({ role, content }) => ({ role, content })),
      [
        { role: 'user', content: 'I need help.' },
        { role: 'assistant', content: 'How can I help?' },
      ],
    );
  } finally {
    Chat.findOne = originalChatFindOne;
    Message.find = originalMessageFind;
    Message.create = originalMessageCreate;
    client.chat.completions.create = originalCompletionCreate;
    if (originalApiKey === undefined) {
      delete process.env.NEBIUS_API_KEY;
    } else {
      process.env.NEBIUS_API_KEY = originalApiKey;
    }
  }
});

test('uploadDocument extracts, chunks, embeds, and stores the uploaded PDF', async () => {
  const originalCreate = Document.create;
  const originalChunkCreate = Chunk.create;
  const originalApiKey = process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY = 'test-nebius-key';
  const client = getClient();
  const originalEmbeddingCreate = client.embeddings.create;
  let createdDocument;
  const createdChunks = [];
  const embeddingRequests = [];
  Document.create = async (document) => {
    createdDocument = document;
    return { _id: 'document_001', ...document };
  };
  Chunk.create = async (chunk) => {
    createdChunks.push(chunk);
    return chunk;
  };
  client.embeddings.create = async (request) => {
    embeddingRequests.push(request);
    return { data: [{ embedding: [0.1, 0.2] }] };
  };

  try {
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([createPdf('PDF extraction test content')], {
        type: 'application/pdf',
      }),
      'notes.pdf',
    );
    const response = await fetch(`${baseUrl}/documents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt.sign(
          { userId: 'user_001' },
          testJwtSecret,
        )}`,
      },
      body: formData,
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(createdDocument.title, 'notes.pdf');
    assert.ok(createdDocument.fileName);
    assert.equal(createdDocument.userId, 'user_001');
    assert.deepEqual(body.data, {
      _id: 'document_001',
      ...createdDocument,
    });
    assert.equal(createdChunks.length, 1);
    assert.equal(createdChunks[0].documentId, 'document_001');
    assert.match(createdChunks[0].text, /PDF extraction test content/);
    assert.deepEqual(createdChunks[0].embedding, [0.1, 0.2]);
    assert.equal(embeddingRequests.length, 1);
    assert.equal(embeddingRequests[0].model, 'Qwen/Qwen3-Embedding-8B');
    assert.equal(
      embeddingRequests[0].input,
      createdChunks[0].text,
    );
  } finally {
    Document.create = originalCreate;
    Chunk.create = originalChunkCreate;
    client.embeddings.create = originalEmbeddingCreate;
    if (originalApiKey === undefined) {
      delete process.env.NEBIUS_API_KEY;
    } else {
      process.env.NEBIUS_API_KEY = originalApiKey;
    }
    if (createdDocument) {
      await unlink(join(process.cwd(), 'uploads', createdDocument.fileName));
    }
  }
});

test('chunkText splits text into 500-character pieces', () => {
  const text = 'x'.repeat(1001);
  const chunks = chunkText(text);

  assert.deepEqual(chunks.map((chunk) => chunk.length), [500, 500, 1]);
  assert.equal(chunks.join(''), text);
});

test('buildContext formats chunks and handles empty results', () => {
  assert.equal(
    buildContext([{ text: 'first' }, { text: 'second' }]),
    'Chunk 1: first\n\nChunk 2: second',
  );
  assert.equal(buildContext([]), 'No relevant context found.');
});

test('getDocuments returns only documents belonging to the logged-in user', async () => {
  const originalFind = Document.find;
  const documents = [{ _id: 'document_001', title: 'notes.txt' }];
  Document.find = async (filter) => {
    assert.deepEqual(filter, { userId: 'user_001' });
    return documents;
  };

  try {
    const response = await fetch(`${baseUrl}/documents`, {
      headers: {
        Authorization: `Bearer ${jwt.sign(
          { userId: 'user_001' },
          testJwtSecret,
        )}`,
      },
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.data, documents);
  } finally {
    Document.find = originalFind;
  }
});

test("query returns an AI answer grounded in the user's most relevant document chunks", async () => {
  const originalDocumentFind = Document.find;
  const originalChunkFind = Chunk.find;
  const originalApiKey = process.env.NEBIUS_API_KEY;
  process.env.NEBIUS_API_KEY = 'test-nebius-key';
  const client = getClient();
  const originalEmbeddingCreate = client.embeddings.create;
  const originalCompletionCreate = client.chat.completions.create;
  const completionRequests = [];
  let embeddingRequest;
  Document.find = async (filter) => {
    assert.deepEqual(filter, { userId: 'user_001' });
    return [{ _id: 'document_001' }];
  };
  Chunk.find = async (filter) => {
    assert.deepEqual(filter, {
      documentId: { $in: ['document_001'] },
    });
    return [
      { text: 'Best matching text', embedding: [1, 0] },
      { text: 'Second matching text', embedding: [0.9, 0.1] },
      { text: 'Third matching text', embedding: [0.8, 0.2] },
      { text: 'Fourth matching text', embedding: [0.7, 0.3] },
      { text: 'Fifth matching text', embedding: [0.6, 0.4] },
      { text: 'Irrelevant text', embedding: [0, 1] },
    ];
  };
  client.embeddings.create = async (request) => {
    embeddingRequest = request;
    return { data: [{ embedding: [1, 0] }] };
  };
  client.chat.completions.create = async (request) => {
    completionRequests.push(request);
    return {
      choices: [{ message: { content: 'Answer from the uploaded documents.' } }],
    };
  };

  try {
    const response = await fetch(`${baseUrl}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt.sign(
          { userId: 'user_001' },
          testJwtSecret,
        )}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question: 'What is the answer?' }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.answer, 'Answer from the uploaded documents.');
    assert.equal(embeddingRequest.input, 'What is the answer?');
    assert.equal(embeddingRequest.model, 'Qwen/Qwen3-Embedding-8B');
    assert.equal(completionRequests.length, 1);
    assert.equal(completionRequests[0].model, 'Qwen/Qwen3-32B');
    assert.match(
      completionRequests[0].messages[1].content,
      /Best matching text/,
    );
    assert.doesNotMatch(
      completionRequests[0].messages[1].content,
      /Irrelevant text/,
    );
  } finally {
    Document.find = originalDocumentFind;
    Chunk.find = originalChunkFind;
    client.embeddings.create = originalEmbeddingCreate;
    client.chat.completions.create = originalCompletionCreate;
    if (originalApiKey === undefined) {
      delete process.env.NEBIUS_API_KEY;
    } else {
      process.env.NEBIUS_API_KEY = originalApiKey;
    }
  }
});

test('registration rejects passwords shorter than eight characters', async () => {
  const response = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'user@example.com',
      password: 'short',
      name: 'Test User',
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.data, null);
  assert.equal(body.error, 'Password must be at least 8 characters');
});

test('registration hashes the password and omits it from the response', async () => {
  const originalFindOne = User.findOne;
  const originalSave = User.prototype.save;
  let savedUser;
  User.findOne = async () => null;
  User.prototype.save = async function () {
    savedUser = this;
    return this;
  };

  try {
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'new-user@example.com',
        password: 'a-secure-password',
        name: 'New User',
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(
      await bcrypt.compare('a-secure-password', savedUser.password),
      true,
    );
    assert.deepEqual(Object.keys(body.data).sort(), ['_id', 'email', 'name']);
  } finally {
    User.findOne = originalFindOne;
    User.prototype.save = originalSave;
  }
});

test('registration returns conflict when the email already exists', async () => {
  const originalFindOne = User.findOne;
  User.findOne = async () => ({});

  try {
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'existing@example.com',
        password: 'a-secure-password',
        name: 'Existing User',
      }),
    });

    assert.equal(response.status, 409);
  } finally {
    User.findOne = originalFindOne;
  }
});

test('login returns a signed token and user data without the password', async () => {
  const originalFindOne = User.findOne;
  const originalSecret = process.env.JWT_SECRET;
  const secret = 'test-jwt-secret';
  const password = 'a-secure-password';
  const user = new User({
    email: 'login@example.com',
    password: await bcrypt.hash(password, 10),
    name: 'Login User',
  });
  User.findOne = async () => user;
  process.env.JWT_SECRET = secret;

  try {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(jwt.verify(body.data.token, secret).userId, user._id.toString());
    assert.equal(body.data.user.email, user.email);
    assert.equal('password' in body.data.user, false);
  } finally {
    User.findOne = originalFindOne;
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  }
});

test('login uses the same unauthorized response for unknown users and bad passwords', async () => {
  const originalFindOne = User.findOne;
  const passwordHash = await bcrypt.hash('a-secure-password', 10);
  const user = new User({
    email: 'login@example.com',
    password: passwordHash,
    name: 'Login User',
  });

  try {
    const errors = [];
    for (const [result, password] of [
      [null, 'a-secure-password'],
      [user, 'wrong-password'],
    ]) {
      User.findOne = async () => result;
      const response = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'login@example.com', password }),
      });
      const body = await response.json();

      assert.equal(response.status, 401);
      errors.push(body.error);
    }

    assert.equal(errors[0], errors[1]);
  } finally {
    User.findOne = originalFindOne;
  }
});

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
