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
const PATCH_MIME_TYPE = 'text/x-patch';
const RESOURCE_AUDIENCE = ['assistant' as const];

function completeByPrefix(values: readonly string[], prefix: string): string[] {
  return values.filter((value) => value.startsWith(prefix));
}

function createMarkdownContent(
  uri: URL,
  text: string
): { uri: string; mimeType: string; text: string } {
  return { uri: uri.href, mimeType: RESOURCE_MIME_TYPE, text };
}

function formatUnknownToolMessage(name: string): string {
  return `Unknown tool: ${name}`;
}

function formatDiffResourceText(): string {
  const slot = getDiff();
  if (!slot) {
    return '# No diff cached. Call generate_diff first.';
  }

  return `# Diff — ${slot.mode} — ${slot.generatedAt}\n# ${slot.stats.files} file(s), +${slot.stats.added} -${slot.stats.deleted}\n\n${slot.diff}`;
}

export interface StaticResourceDef {
  id: string;
  uri: string;
  title: string;
  description: string;
  priority: number;
  content?: () => string;
}

export const STATIC_RESOURCES: readonly StaticResourceDef[] = [
  {
    id: 'server-instructions',
    uri: 'internal://instructions',
    title: 'Server Instructions',
    description: 'Complete server usage instructions.',
    priority: 0.8,
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
  const content = contentOverride ?? def.content?.() ?? '';
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
        toolName: (value) => completeByPrefix(toolNames, value),
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
      const text = info ?? formatUnknownToolMessage(name);
      return { contents: [createMarkdownContent(uri, text)] };
    }
  );
}

export const DIFF_RESOURCE_DESCRIPTION =
  'The most recently generated diff, cached by generate_diff. Read by all review tools automatically.';

function registerDiffResource(server: McpServer): void {
  server.registerResource(
    'diff-current',
    DIFF_RESOURCE_URI,
    {
      title: 'Current Diff',
      description: DIFF_RESOURCE_DESCRIPTION,
      mimeType: PATCH_MIME_TYPE,
      annotations: {
        audience: RESOURCE_AUDIENCE,
        priority: 1.0,
      },
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: PATCH_MIME_TYPE,
          text: formatDiffResourceText(),
        },
      ],
    })
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
