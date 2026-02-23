import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getToolContracts } from '../src/lib/tool-contracts.js';
import { buildServerInstructions } from '../src/resources/instructions.js';
import { createServer } from '../src/server.js';

function createClientServerPair(): {
  client: Client;
  connect: () => Promise<void>;
  close: () => Promise<void>;
} {
  const { server, shutdown } = createServer();
  const client = new Client({ name: 'contract-consistency', version: '0.0.0' });
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
      await shutdown();
    },
  };
}

test('tool contracts have unique names', () => {
  const names = getToolContracts().map((contract) => contract.name);
  const unique = new Set(names);
  assert.equal(unique.size, names.length);
});

test('generated instructions include all tools and model assignments', () => {
  const instructions = buildServerInstructions();

  for (const contract of getToolContracts()) {
    assert.match(instructions, new RegExp(`### \`${contract.name}\``));

    if (contract.model === 'none') {
      assert.match(instructions, /\(Sync\)/);
    } else if (contract.model.includes('flash')) {
      assert.match(instructions, /Flash/);
    } else if (contract.model.includes('pro')) {
      assert.match(instructions, /Pro/);
    }
  }
});

test('review-guide prompt accepts all contract tool names', async () => {
  const { client, connect, close } = createClientServerPair();
  await connect();

  try {
    for (const contract of getToolContracts()) {
      const prompt = await client.getPrompt({
        name: 'review-guide',
        arguments: { tool: contract.name, focusArea: 'security' },
      });

      const message = prompt.messages[0];
      assert.ok(message);
      assert.equal(message.role, 'user');
      assert.equal(message.content.type, 'text');
      assert.match(
        message.content.text,
        new RegExp(`Tool: \`${contract.name}\``)
      );
      assert.match(message.content.text, new RegExp(contract.model));
    }
  } finally {
    await close();
  }
});

test('tool-info resources publish model and parameter contracts from canonical source', async () => {
  const { client, connect, close } = createClientServerPair();
  await connect();

  try {
    for (const contract of getToolContracts()) {
      const resource = await client.readResource({
        uri: `internal://tool-info/${contract.name}`,
      });

      const content = resource.contents[0];
      assert.ok(content && 'text' in content);
      assert.match(content.text, new RegExp(`\`${contract.model}\``));

      for (const parameter of contract.params) {
        assert.match(content.text, new RegExp(`\\| ${parameter.name} \\|`));
      }
    }
  } finally {
    await close();
  }
});
