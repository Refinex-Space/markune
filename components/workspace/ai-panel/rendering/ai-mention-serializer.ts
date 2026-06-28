// @author refinex
// @mention 序列化核心：id 构建解析、文本与 mention 提取、选项过滤。
// 纯逻辑，不依赖 DOM，便于单测。contenteditable 编辑器的 DOM 操作在 ai-mentions-editor.tsx。

export type MentionKind = 'file' | 'folder' | 'skill' | 'agent' | 'tool';

export const MENTION_PREFIXES = {
  FILE: 'file:',
  FOLDER: 'folder:',
  SKILL: 'skill:',
  AGENT: 'agent:',
  TOOL: 'tool:',
} as const;

export interface MentionOption {
  id: string;
  label: string;
  type: MentionKind;
  path: string;
  description?: string;
}

export interface ExtractedMention {
  id: string;
  label: string;
  type: MentionKind;
}

/** 构建 mention id：kind:value（value 可能含冒号，解析时按首个冒号分割）。 */
export function buildMentionId(kind: MentionKind, value: string): string {
  return `${kind}:${value}`;
}

/** 解析 mention id 为 { kind, value }。 */
export function parseMentionId(id: string): { kind: MentionKind; value: string } | null {
  const colonIndex = id.indexOf(':');
  if (colonIndex === -1) return null;
  const kind = id.slice(0, colonIndex) as MentionKind;
  const value = id.slice(colonIndex + 1);
  if (!['file', 'folder', 'skill', 'agent', 'tool'].includes(kind)) return null;
  return { kind, value };
}

/** 从 mention id 提取展示 label（file/folder 取路径末段，其余取 value）。 */
export function labelFromId(id: string): string {
  const parsed = parseMentionId(id);
  if (!parsed) return id;
  if (parsed.kind === 'file' || parsed.kind === 'folder') {
    const parts = parsed.value.split('/');
    return parts[parts.length - 1] || parsed.value;
  }
  return parsed.value;
}

/** mention token 正则：@[kind:value]，value 不含 ] */
const MENTION_TOKEN = /@\[([^\]]+)\]/g;

/** 序列化结果：文本（含 @[id] token）+ 提取的 mention 列表。 */
export interface SerializeResult {
  text: string;
  mentions: ExtractedMention[];
}

/** 从文本中提取所有 @[id] mention。 */
export function serializeMentions(text: string): SerializeResult {
  const mentions: ExtractedMention[] = [];
  let match: RegExpExecArray | null;
  MENTION_TOKEN.lastIndex = 0;
  while ((match = MENTION_TOKEN.exec(text)) !== null) {
    const id = match[1];
    const parsed = parseMentionId(id);
    if (parsed) {
      mentions.push({
        id,
        label: labelFromId(id),
        type: parsed.kind,
      });
    }
  }
  return { text, mentions };
}

/** deserializeMentions：与 serializeMentions 等价（文本即序列化态）。 */
export function deserializeMentions(text: string): SerializeResult {
  return serializeMentions(text);
}

/** 按 query 过滤 mention 选项（匹配 label/path/description，大小写不敏感）。 */
export function filterMentionOptions(
  options: MentionOption[],
  query: string,
): MentionOption[] {
  if (!query) return options;
  const q = query.toLowerCase();
  return options.filter((opt) => {
    const label = opt.label.toLowerCase();
    const path = opt.path.toLowerCase();
    const desc = opt.description?.toLowerCase() ?? '';
    return label.includes(q) || path.includes(q) || desc.includes(q);
  });
}
