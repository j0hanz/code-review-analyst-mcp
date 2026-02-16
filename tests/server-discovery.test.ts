import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createServer } from '../src/server.js';

function createClientServerPair(): {
  client: Client;
  connect: () => Promise<void>;
  close: () => Promise<void>;
} {
  const server = createServer();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  return {
    client,
    connect: async () => {
      await Promise.all([
        server.connect(serverTransport),
        client.connect(clientTransport),
      ]);
    },
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

test('resource internal://instructions is discoverable', async () => {
  const { client, connect, close } = createClientServerPair();
  await connect();

  try {
    const result = await client.listResources();
    const resource = result.resources.find(
      (r) => r.uri === 'internal://instructions'
    );

    assert.ok(resource, 'internal://instructions resource should exist');
    assert.equal(resource.mimeType, 'text/markdown');
    assert.equal(resource.name, 'server-instructions');
  } finally {
    await close();
  }
});

test('resource internal://instructions returns markdown content', async () => {
  const { client, connect, close } = createClientServerPair();
  await connect();

  try {
    const result = await client.readResource({
      uri: 'internal://instructions',
    });

    assert.equal(result.contents.length, 1);

    const content = result.contents[0];
    assert.ok(content);
    assert.equal(content.mimeType, 'text/markdown');
    assert.ok('text' in content, 'Resource should have text content');
    assert.ok(
      typeof content.text === 'string' && content.text.length > 0,
      'Resource text should be non-empty'
    );
  } finally {
    await close();
  }
});

test('prompt get-help is discoverable', async () => {
  const { client, connect, close } = createClientServerPair();
  await connect();

  try {
    const result = await client.listPrompts();
    const prompt = result.prompts.find((p) => p.name === 'get-help');

    assert.ok(prompt, 'get-help prompt should exist');
    assert.equal(prompt.description, 'Return the server usage instructions.');
  } finally {
    await close();
  }
});

test('prompt get-help returns user message with instructions', async () => {
  const { client, connect, close } = createClientServerPair();
  await connect();

  try {
    const result = await client.getPrompt({ name: 'get-help' });

    assert.ok(result.messages.length > 0, 'Should return at least one message');

    const message = result.messages[0];
    assert.ok(message);
    assert.equal(message.role, 'user');
    assert.equal(message.content.type, 'text');
    assert.ok(
      typeof message.content.text === 'string' &&
        message.content.text.length > 0,
      'Prompt text should be non-empty'
    );
  } finally {
    await close();
  }
});
