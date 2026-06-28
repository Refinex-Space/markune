// @author refinex
// 工具元数据注册表 + MCP 工具解析 + diff 统计 + 路径美化。
// 一比一复刻 1code agent-tool-registry.tsx 的逻辑（title/subtitle 函数 + parseMcpToolType +
// calculateDiffStats + getDisplayPath）。复刻时简化了沙箱前缀（1code 专属），保留项目相对路径逻辑。

import type { MessagePart } from '../ai-contracts';

export type McpToolCategory =
  | 'search'
  | 'list'
  | 'get'
  | 'create'
  | 'update'
  | 'delete'
  | 'send'
  | 'generate'
  | 'other';

export interface McpToolInfo {
  serverName: string;
  toolName: string;
  displayName: string;
  category: McpToolCategory;
}

export interface ToolMeta {
  title: (part: MessagePart) => string;
  subtitle?: (part: MessagePart) => string;
  tooltipContent?: (part: MessagePart, projectPath?: string) => string;
}

const MCP_TOOL_PREFIX = 'tool-mcp__';

const BUILTIN_MCP_TOOLS: Record<string, McpToolInfo> = {
  'tool-ListMcpResources': {
    serverName: 'mcp',
    toolName: 'list_resources',
    displayName: 'List Resources',
    category: 'list',
  },
  'tool-ReadMcpResource': {
    serverName: 'mcp',
    toolName: 'read_resource',
    displayName: 'Read Resource',
    category: 'get',
  },
};

/** 解析 MCP 工具类型：tool-mcp__server__tool_name 或内置 MCP 工具。 */
export function parseMcpToolType(partType: string): McpToolInfo | null {
  const builtin = BUILTIN_MCP_TOOLS[partType];
  if (builtin) return builtin;
  if (!partType.startsWith(MCP_TOOL_PREFIX)) return null;
  const withoutPrefix = partType.slice(MCP_TOOL_PREFIX.length);
  const separatorIndex = withoutPrefix.indexOf('__');
  if (separatorIndex === -1) return null;
  const serverName = withoutPrefix.slice(0, separatorIndex);
  const toolName = withoutPrefix.slice(separatorIndex + 2);
  return {
    serverName,
    toolName,
    displayName: formatMcpToolName(toolName),
    category: categorizeMcpTool(toolName),
  };
}

function formatMcpToolName(toolName: string): string {
  return toolName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

function categorizeMcpTool(toolName: string): McpToolCategory {
  const lower = toolName.toLowerCase();
  if (lower.startsWith('search_') || lower.startsWith('query_')) return 'search';
  if (lower.startsWith('list_')) return 'list';
  if (lower.startsWith('get_') || lower.startsWith('fetch_') || lower.startsWith('retrieve_'))
    return 'get';
  if (lower.startsWith('create_') || lower.startsWith('add_') || lower.startsWith('draft_'))
    return 'create';
  if (lower.startsWith('update_') || lower.startsWith('modify_') || lower.startsWith('manage_'))
    return 'update';
  if (lower.startsWith('delete_') || lower.startsWith('remove_')) return 'delete';
  if (lower.startsWith('send_')) return 'send';
  if (lower.startsWith('generate_')) return 'generate';
  return 'other';
}

/** 逐行对比的简单 diff 统计（非 LCS，按行号对齐）。 */
export function calculateDiffStats(oldString: string, newString: string) {
  const oldLines = oldString.split('\n');
  const newLines = newString.split('\n');
  const maxLines = Math.max(oldLines.length, newLines.length);
  let addedLines = 0;
  let removedLines = 0;
  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    if (oldLine !== undefined && newLine !== undefined) {
      if (oldLine !== newLine) {
        removedLines++;
        addedLines++;
      }
    } else if (oldLine !== undefined) {
      removedLines++;
    } else if (newLine !== undefined) {
      addedLines++;
    }
  }
  return { addedLines, removedLines };
}

/** 路径美化：项目相对路径优先，否则取最后 3 段。 */
export function getDisplayPath(filePath: string, projectPath?: string): string {
  if (!filePath) return '';
  if (projectPath && filePath.startsWith(projectPath)) {
    const relative = filePath.slice(projectPath.length).replace(/^\//, '');
    return relative || filePath.split('/').pop() || filePath;
  }
  if (filePath.startsWith('/')) {
    const parts = filePath.split('/');
    const rootIndicators = ['apps', 'packages', 'src', 'lib', 'components', 'docs'];
    const rootIndex = parts.findIndex((p) => rootIndicators.includes(p));
    if (rootIndex > 0) return parts.slice(rootIndex).join('/');
    if (parts.length > 3) return parts.slice(-3).join('/');
  }
  return filePath;
}

// —— 工具注册表 ——

export const AgentToolRegistry: Record<string, ToolMeta> = {
  'tool-Bash': {
    title: (p) => {
      const isPending = p.state !== 'output-available' && p.state !== 'output-error';
      if (p.state === 'input-streaming') return 'Generating command';
      return isPending ? 'Running command' : 'Ran command';
    },
    subtitle: (p) => {
      if (p.state === 'input-streaming') return '';
      const command = (p.input as { command?: string } | undefined)?.command || '';
      if (!command) return '';
      let normalized = command.replace(/\\\s*\n\s*/g, ' ').trim();
      normalized = normalized.replace(/\/(?:Users|home|root)\/[^\s"']+/g, (match) =>
        getDisplayPath(match),
      );
      return normalized.length > 50 ? normalized.slice(0, 47) + '...' : normalized;
    },
  },
  'tool-Read': {
    title: (p) => {
      const isPending = p.state !== 'output-available' && p.state !== 'output-error';
      if (p.state === 'input-streaming') return 'Preparing to read';
      return isPending ? 'Reading' : 'Read';
    },
    subtitle: (p) => {
      if (p.state === 'input-streaming') return '';
      const filePath = (p.input as { file_path?: string } | undefined)?.file_path || '';
      if (!filePath) return '';
      return filePath.split('/').pop() || '';
    },
    tooltipContent: (p, projectPath) => {
      if (p.state === 'input-streaming') return '';
      const filePath = (p.input as { file_path?: string } | undefined)?.file_path || '';
      return getDisplayPath(filePath, projectPath);
    },
  },
  'tool-Edit': {
    title: (p) => {
      if (p.state === 'input-streaming') return 'Preparing edit';
      const filePath = (p.input as { file_path?: string } | undefined)?.file_path || '';
      if (!filePath) return 'Edit';
      return filePath.split('/').pop() || 'Edit';
    },
    subtitle: (p) => {
      if (p.state === 'input-streaming') return '';
      const isPending = p.state !== 'output-available' && p.state !== 'output-error';
      if (isPending) return '';
      const input = p.input as { old_string?: string; new_string?: string } | undefined;
      const oldString = input?.old_string || '';
      const newString = input?.new_string || '';
      if (!oldString && !newString) return '';
      if (oldString !== newString) {
        const { addedLines, removedLines } = calculateDiffStats(oldString, newString);
        return `<span style="font-size: 11px; color: #16a34a">+${addedLines}</span> <span style="font-size: 11px; color: #dc2626">-${removedLines}</span>`;
      }
      return '';
    },
  },
  'tool-Write': {
    title: (p) => {
      if (p.state === 'input-streaming') return 'Preparing write';
      const filePath = (p.input as { file_path?: string } | undefined)?.file_path || '';
      if (!filePath) return 'Write';
      return filePath.split('/').pop() || 'Write';
    },
    subtitle: (p) => {
      if (p.state === 'input-streaming') return '';
      const isPending = p.state !== 'output-available' && p.state !== 'output-error';
      if (isPending) return '';
      const content = (p.input as { content?: string } | undefined)?.content || '';
      const lines = content ? content.split('\n').length : 0;
      return lines > 0 ? `${lines} 行` : '';
    },
  },
  'tool-Grep': {
    title: (p) => {
      const isPending = p.state !== 'output-available' && p.state !== 'output-error';
      if (p.state === 'input-streaming') return 'Preparing search';
      if (isPending) return 'Grepping';
      const output = p.output as { mode?: string; numFiles?: number; numLines?: number } | undefined;
      const mode = output?.mode;
      const numFiles = output?.numFiles || 0;
      const numLines = output?.numLines || 0;
      if (mode === 'content') {
        return numLines > 0 ? `Found ${numLines} matches` : 'No matches';
      }
      return numFiles > 0 ? `Grepped ${numFiles} files` : 'No matches';
    },
    subtitle: (p) => {
      if (p.state === 'input-streaming') return '';
      const input = p.input as { pattern?: string; path?: string } | undefined;
      const pattern = input?.pattern || '';
      const path = input?.path || '';
      if (path) {
        const displayPath = getDisplayPath(path);
        const combined = `${pattern} in ${displayPath}`;
        return combined.length > 40 ? combined.slice(0, 37) + '...' : combined;
      }
      return pattern.length > 40 ? pattern.slice(0, 37) + '...' : pattern;
    },
  },
  'tool-Glob': {
    title: (p) => {
      const isPending = p.state !== 'output-available' && p.state !== 'output-error';
      if (p.state === 'input-streaming') return 'Preparing search';
      if (isPending) return 'Finding files';
      return 'Found files';
    },
    subtitle: (p) => {
      if (p.state === 'input-streaming') return '';
      const pattern = (p.input as { pattern?: string } | undefined)?.pattern || '';
      return pattern.length > 40 ? pattern.slice(0, 37) + '...' : pattern;
    },
  },
  'tool-WebSearch': {
    title: (p) => {
      const isPending = p.state !== 'output-available' && p.state !== 'output-error';
      if (p.state === 'input-streaming') return 'Preparing search';
      return isPending ? 'Searching web' : 'Searched web';
    },
    subtitle: (p) => {
      if (p.state === 'input-streaming') return '';
      const query = (p.input as { query?: string } | undefined)?.query || '';
      return query.length > 40 ? query.slice(0, 37) + '...' : query;
    },
  },
  'tool-WebFetch': {
    title: (p) => {
      const isPending = p.state !== 'output-available' && p.state !== 'output-error';
      if (p.state === 'input-streaming') return 'Preparing fetch';
      return isPending ? 'Fetching' : 'Fetched';
    },
    subtitle: (p) => {
      if (p.state === 'input-streaming') return '';
      const url = (p.input as { url?: string } | undefined)?.url || '';
      return url.length > 50 ? url.slice(0, 47) + '...' : url;
    },
  },
  'tool-TodoWrite': {
    title: (p) => {
      const isPending = p.state !== 'output-available' && p.state !== 'output-error';
      const action = (p.input as { action?: string } | undefined)?.action || 'update';
      if (isPending) return action === 'add' ? 'Adding todo' : 'Updating todos';
      return action === 'add' ? 'Added todo' : 'Updated todos';
    },
    subtitle: (p) => {
      const todos = (p.input as { todos?: unknown[] } | undefined)?.todos || [];
      if (todos.length === 0) return '';
      return `${todos.length} ${todos.length === 1 ? 'item' : 'items'}`;
    },
  },
  'tool-Thinking': {
    title: (p) => {
      const isPending = p.state !== 'output-available' && p.state !== 'output-error';
      return isPending ? 'Thinking' : 'Thought';
    },
  },
};

/** 获取工具元数据，未注册时返回 fallback。 */
export function getToolMeta(partType: string): ToolMeta {
  return (
    AgentToolRegistry[partType] ?? {
      title: () => partType.replace('tool-', ''),
    }
  );
}
