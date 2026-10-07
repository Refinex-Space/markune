import type { AgentMessage } from './agent-session';

export type ActivityKind =
  | 'read'
  | 'edit'
  | 'delete'
  | 'move'
  | 'search'
  | 'execute'
  | 'think'
  | 'fetch'
  | 'switch_mode'
  | 'other'
  | 'web'
  | 'skill'
  | 'mcp'
  | 'plugin';
const kinds = new Set([
  'read',
  'edit',
  'delete',
  'move',
  'search',
  'execute',
  'think',
  'fetch',
  'switch_mode',
]);
export function toolPresentation(message: AgentMessage) {
  const tool = message.tool ?? {};
  const kind = typeof tool.kind === 'string' ? tool.kind : 'other';
  const name = typeof tool.name === 'string' ? tool.name : '';
  const title = message.text || '工具操作';
  let category: ActivityKind = kinds.has(kind)
    ? (kind as ActivityKind)
    : 'other';
  // refinex: Only explicit names/paths refine the standard category; arbitrary output never determines tool identity.
  if (kind === 'search' || category === 'other') {
    if (
      /^(web_search|web\.run|web_search_preview)$/.test(name) ||
      /^Web search(?:\s*:|$)/i.test(title)
    )
      category = 'web';
  }
  if (kind === 'read' || category === 'other') {
    const paths = Array.isArray(tool.locations)
      ? tool.locations.map((item) => asRecord(item)?.path)
      : [];
    if (
      /^(skill|load_skill|read_skill)$/.test(name) ||
      paths.some(
        (path) =>
          typeof path === 'string' && /(?:^|[/\\])SKILL\.md$/.test(path),
      ) ||
      /^Read file ['"].*[/\\]SKILL\.md['"]$/i.test(title)
    )
      category = 'skill';
  }
  if (category === 'other') {
    if (/^mcp(?:__|[./:])/.test(name)) category = 'mcp';
    else if (/^plugins?(?:__|[./:])/.test(name)) category = 'plugin';
    else if (/^(bash|shell|run_command|exec_command)$/.test(name))
      category = 'execute';
  }
  const labels: Record<ActivityKind, string> = {
    read: '读取文件',
    edit: '修改内容',
    delete: '删除',
    move: '移动',
    search: '搜索',
    execute: '执行命令',
    think: '分析',
    fetch: '获取资源',
    switch_mode: '切换模式',
    other: '工具调用',
    web: '网络搜索',
    skill: '读取技能',
    mcp: 'MCP 工具',
    plugin: '插件工具',
  };
  return { category, label: labels[category], title, name };
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function toolStatus(tool: Record<string, unknown>, active: boolean) {
  switch (tool.status) {
    case 'completed':
      return { label: '已完成', state: 'completed', running: false };
    case 'failed':
      return { label: '失败', state: 'failed', running: false };
    case 'in_progress':
      return {
        label: active ? '执行中' : '未完成',
        state: active ? 'running' : 'inactive',
        running: active,
      };
    case 'pending':
    case undefined:
    case null:
      return {
        label: active ? '等待中' : '未完成',
        state: active ? 'pending' : 'inactive',
        running: false,
      };
    default:
      return { label: '状态未知', state: 'unknown', running: false };
  }
}
