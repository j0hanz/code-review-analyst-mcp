import {
  type McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js';

import { DIFF_RESOURCE_URI, getDiff } from '../lib/diff-store.js';
import { buildServerConfig } from './server-config.js';
import { buildToolCatalog } from './tool-catalog.js';
import { getToolInfo, getToolInfoNames } from './tool-info.js';
import { buildWorkflowGuide } from './workflows.js';

const RESOURCE_MIME_TYPE = 'text/markdown';
const RESOURCE_AUDIENCE = ['assistant' as const];

function createMarkdownContent(
  uri: URL,
  text: string
): { uri: string; mimeType: string; text: string } {
  return { uri: uri.href, mimeType: RESOURCE_MIME_TYPE, text };
}

interface StaticResourceDef {
  id: string;
  uri: string;
  title: string;
  description: string;
  priority: number;
  content: () => string;
}

const STATIC_RESOURCES: readonly StaticResourceDef[] = [
  {
    id: 'server-instructions',
    uri: 'internal://instructions',
    title: 'Server Instructions',
    description: 'Complete server usage instructions.',
    priority: 0.8,
    content: () => '', // placeholder — resolved at registration time
  },
  {
    id: 'tool-catalog',
    uri: 'internal://tool-catalog',
    title: 'Tool Catalog',
    description: 'Tool reference: models, params, outputs, data flow.',
    priority: 1.0,
    content: buildToolCatalog,
  },
  {
    id: 'workflows',
    uri: 'internal://workflows',
    title: 'Workflow Reference',
    description: 'Recommended workflows and tool sequences.',
    priority: 0.9,
    content: buildWorkflowGuide,
  },
  {
    id: 'server-config',
    uri: 'internal://server-config',
    title: 'Server Configuration',
    description: 'Runtime configuration and limits.',
    priority: 0.7,
    content: buildServerConfig,
  },
] as const;

function registerStaticResource(
  server: McpServer,
  def: StaticResourceDef,
  contentOverride?: string
): void {
  const content = contentOverride ?? def.content();
  server.registerResource(
    def.id,
    def.uri,
    {
      title: def.title,
      description: def.description,
      mimeType: RESOURCE_MIME_TYPE,
      annotations: {
        audience: RESOURCE_AUDIENCE,
        priority: def.priority,
      },
    },
    (uri) => ({ contents: [createMarkdownContent(uri, content)] })
  );
}

function registerToolInfoResources(server: McpServer): void {
  const toolNames = getToolInfoNames();

  server.registerResource(
    'tool-info',
    new ResourceTemplate('internal://tool-info/{toolName}', {
      list: undefined,
      complete: {
        toolName: (value) => toolNames.filter((name) => name.startsWith(value)),
      },
    }),
    {
      title: 'Tool Info',
      description: 'Per-tool reference: model, params, output, gotchas.',
      mimeType: RESOURCE_MIME_TYPE,
      annotations: {
        audience: RESOURCE_AUDIENCE,
        priority: 0.6,
      },
    },
    (uri, { toolName }) => {
      const name = typeof toolName === 'string' ? toolName : '';
      const info = getToolInfo(name);
      const text = info ?? `Unknown tool: ${name}`;
      return { contents: [createMarkdownContent(uri, text)] };
    }
  );
}

function registerDiffResource(server: McpServer): void {
  server.registerResource(
    'diff-current',
    new ResourceTemplate(DIFF_RESOURCE_URI, { list: undefined }),
    {
      title: 'Current Diff',
      description:
        'The most recently generated diff, cached by generate_diff. Read by all review tools automatically.',
      mimeType: 'text/x-patch',
      annotations: {
        audience: ['assistant' as const],
        priority: 1.0,
      },
    },
    (uri) => {
      const slot = getDiff();
      const text = slot
        ? `# Diff — ${slot.mode} — ${slot.generatedAt}\n# ${slot.stats.files} file(s), +${slot.stats.added} -${slot.stats.deleted}\n\n${slot.diff}`
        : '# No diff cached. Call generate_diff first.';
      return { contents: [{ uri: uri.href, mimeType: 'text/x-patch', text }] };
    }
  );
}

export function registerAllResources(
  server: McpServer,
  instructions: string
): void {
  for (const def of STATIC_RESOURCES) {
    const override =
      def.id === 'server-instructions' ? instructions : undefined;
    registerStaticResource(server, def, override);
  }

  registerToolInfoResources(server);
  registerDiffResource(server);
}
