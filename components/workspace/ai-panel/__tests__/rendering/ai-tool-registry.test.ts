import { describe, expect, it } from 'vitest';

import {
  AgentToolRegistry,
  parseMcpToolType,
  calculateDiffStats,
  getDisplayPath,
  getToolMeta,
} from '../../rendering/ai-tool-registry';
import type { MessagePart } from '../../ai-contracts';

function part(overrides: Partial<MessagePart> = {}): MessagePart {
  return { type: 'tool-Bash', state: 'output-available', ...overrides };
}

describe('AgentToolRegistry', () => {
  it('Bash title 反映运行/完成状态', () => {
    const meta = AgentToolRegistry['tool-Bash'];
    expect(meta.title(part({ state: 'input-streaming' }))).toBe('Generating command');
    expect(meta.title(part({ state: 'input-available' }))).toBe('Running command');
    expect(meta.title(part({ state: 'output-available' }))).toBe('Ran command');
  });

  it('Bash subtitle 显示命令并美化路径', () => {
    const meta = AgentToolRegistry['tool-Bash'];
    const s = meta.subtitle(
      part({ state: 'output-available', input: { command: 'ls /Users/test/app' } }),
    );
    expect(s).toContain('ls');
    expect(s).not.toContain('/Users/test/app');
  });

  it('Edit title 是文件 basename', () => {
    const meta = AgentToolRegistry['tool-Edit'];
    expect(
      meta.title(
        part({ type: 'tool-Edit', state: 'output-available', input: { file_path: '/a/b/c.md' } }),
      ),
    ).toBe('c.md');
  });

  it('Edit subtitle 返回 diff 统计 HTML', () => {
    const meta = AgentToolRegistry['tool-Edit'];
    const s = meta.subtitle(
      part({
        type: 'tool-Edit',
        state: 'output-available',
        input: { old_string: 'a\nb', new_string: 'a\nc\nd' },
      }),
    );
    expect(s).toContain('+');
    expect(s).toContain('-');
  });

  it('Read title + tooltipContent', () => {
    const meta = AgentToolRegistry['tool-Read'];
    expect(
      meta.title(
        part({ type: 'tool-Read', state: 'output-available' }),
      ),
    ).toBe('Read');
    expect(
      meta.tooltipContent?.(
        part({ type: 'tool-Read', state: 'output-available', input: { file_path: '/a/b.md' } }),
        '/a',
      ),
    ).toBe('b.md');
  });

  it('WebSearch title 反映搜索状态', () => {
    const meta = AgentToolRegistry['tool-WebSearch'];
    expect(meta.title(part({ type: 'tool-WebSearch', state: 'input-available' }))).toBe(
      'Searching web',
    );
    expect(meta.title(part({ type: 'tool-WebSearch', state: 'output-available' }))).toBe(
      'Searched web',
    );
  });

  it('未知工具类型返回 fallback', () => {
    const meta = getToolMeta('tool-Unknown');
    expect(meta.title(part({ type: 'tool-Unknown' }))).toBe('Unknown');
  });
});

describe('parseMcpToolType', () => {
  it('解析 tool-mcp__server__tool_name', () => {
    const info = parseMcpToolType('tool-mcp__github__search_issues');
    expect(info?.serverName).toBe('github');
    expect(info?.toolName).toBe('search_issues');
    expect(info?.displayName).toBe('Search Issues');
    expect(info?.category).toBe('search');
  });

  it('非 MCP 工具返回 null', () => {
    expect(parseMcpToolType('tool-Bash')).toBeNull();
  });

  it('分类各前缀', () => {
    expect(parseMcpToolType('tool-mcp__s__list_resources')?.category).toBe('list');
    expect(parseMcpToolType('tool-mcp__s__get_file')?.category).toBe('get');
    expect(parseMcpToolType('tool-mcp__s__create_issue')?.category).toBe('create');
    expect(parseMcpToolType('tool-mcp__s__delete_item')?.category).toBe('delete');
    expect(parseMcpToolType('tool-mcp__s__send_message')?.category).toBe('send');
    expect(parseMcpToolType('tool-mcp__s__generate_report')?.category).toBe('generate');
    expect(parseMcpToolType('tool-mcp__s__other_thing')?.category).toBe('other');
  });
});

describe('calculateDiffStats', () => {
  it('新增行', () => {
    const { addedLines, removedLines } = calculateDiffStats('a', 'a\nb');
    expect(addedLines).toBe(1);
    expect(removedLines).toBe(0);
  });

  it('删除行', () => {
    const { addedLines, removedLines } = calculateDiffStats('a\nb', 'a');
    expect(addedLines).toBe(0);
    expect(removedLines).toBe(1);
  });

  it('修改行（同位置不同）= +1 -1', () => {
    const { addedLines, removedLines } = calculateDiffStats('a\nb', 'a\nc');
    expect(addedLines).toBe(1);
    expect(removedLines).toBe(1);
  });
});

describe('getDisplayPath', () => {
  it('项目相对路径', () => {
    expect(getDisplayPath('/project/app/src/index.ts', '/project/app')).toBe('src/index.ts');
  });

  it('取最后 3 段（绝对长路径无指示符）', () => {
    expect(getDisplayPath('/x/y/z/w/file.ts')).toBe('z/w/file.ts');
  });

  it('空路径返回空', () => {
    expect(getDisplayPath('')).toBe('');
  });
});
