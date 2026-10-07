import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AgentMessageView } from '../agent-message';
import { toolPresentation, toolStatus } from '../agent-activity';
import type { AgentMessage } from '../agent-session';
vi.mock('../ai-message-content', () => ({
  AiMessageContent: ({
    markdown,
    streaming,
  }: {
    markdown: string;
    streaming?: boolean;
  }) => <div data-streaming-markdown={streaming}>{markdown}</div>,
}));
const thought: AgentMessage = {
  id: 'thought',
  role: 'thought',
  text: '先检查工作区的文档结构。',
};
const tool: AgentMessage = {
  id: 'tool',
  role: 'tool',
  text: 'Web search: ACP tools',
  tool: {
    kind: 'search',
    status: 'in_progress',
    rawInput: { query: 'ACP tools' },
  },
};

describe('ACP activity presentation', () => {
  it('streams thought text in the open disclosure, then collapses at the boundary and allows reopening', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AgentMessageView message={thought} streaming />,
    );
    const trigger = screen.getByRole('button', { name: '正在思考' });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(
      screen.getByText(thought.text).getAttribute('data-streaming-markdown'),
    ).toBe('true');
    rerender(
      <AgentMessageView
        message={{ ...thought, text: thought.text + '核对引用。' }}
        streaming
      />,
    );
    expect(screen.getByText(thought.text + '核对引用。')).toBeTruthy();
    rerender(<AgentMessageView message={thought} />);
    const completed = screen.getByRole('button', { name: '思考过程' });
    expect(completed.getAttribute('aria-expanded')).toBe('false');
    await user.click(completed);
    expect(completed.getAttribute('aria-expanded')).toBe('true');
  });
  it('respects manual disclosure choice while more chunks arrive and after completion', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AgentMessageView message={thought} streaming />,
    );
    await user.click(screen.getByRole('button'));
    rerender(
      <AgentMessageView
        message={{ ...thought, text: '新的内容' }}
        streaming
      />,
    );
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe(
      'false',
    );
    await user.click(screen.getByRole('button'));
    rerender(<AgentMessageView message={thought} />);
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe(
      'true',
    );
  });
  it('starts historical thoughts closed and does not eagerly render hidden Markdown', () => {
    render(<AgentMessageView message={thought} />);
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(screen.queryByText(thought.text)).toBeNull();
  });
  it('uses explicit tool metadata without inferring capabilities from arbitrary output', () => {
    expect(toolPresentation(tool).category).toBe('web');
    expect(
      toolPresentation({
        ...tool,
        tool: { kind: 'execute', name: 'web_search' },
      }).category,
    ).toBe('execute');
    expect(
      toolPresentation({
        ...tool,
        text: 'Read file "/skills/docs/SKILL.md"',
        tool: { kind: 'read' },
      }).category,
    ).toBe('skill');
    expect(
      toolPresentation({
        ...tool,
        text: 'custom',
        tool: { kind: 'other', name: 'mcp__docs__search' },
      }).category,
    ).toBe('mcp');
    expect(
      toolPresentation({
        ...tool,
        text: 'custom',
        tool: { kind: 'other', name: 'plugin.lookup' },
      }).category,
    ).toBe('plugin');
    expect(
      toolPresentation({
        ...tool,
        text: 'custom',
        tool: { rawOutput: 'web_search skill mcp' },
      }).category,
    ).toBe('other');
  });
  it('preserves inputs and results including false and zero and shows failed details', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AgentMessageView message={tool} active />);
    expect(screen.getByRole('button').textContent).toContain('执行中');
    await user.click(screen.getByRole('button'));
    expect(screen.getByText(/"query": "ACP tools"/)).toBeTruthy();
    rerender(
      <AgentMessageView
        message={{
          ...tool,
          tool: {
            kind: 'search',
            status: 'failed',
            rawInput: false,
            rawOutput: 0,
            content: [
              {
                type: 'content',
                content: { type: 'text', text: '服务暂时不可用' },
              },
            ],
          },
        }}
      />,
    );
    expect(screen.getByRole('button').textContent).toContain('失败');
    expect(screen.getByText('false')).toBeTruthy();
    expect(screen.getByText('服务暂时不可用')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
  });
  it('does not show an endless spinner or successful completion for unfinished history', () => {
    expect(toolStatus({ status: 'in_progress' }, false)).toMatchObject({
      label: '未完成',
      running: false,
    });
    expect(toolStatus({}, true)).toMatchObject({
      label: '等待中',
      running: false,
    });
    expect(toolStatus({ status: 'unexpected' }, true)).toMatchObject({
      label: '状态未知',
      running: false,
    });
    render(
      <AgentMessageView message={{ ...tool, tool: { status: 'failed' } }} />,
    );
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe(
      'true',
    );
  });
  it('renders diffs as literal text and retains resource and terminal identities', async () => {
    const user = userEvent.setup();
    render(
      <AgentMessageView
        message={{
          ...tool,
          tool: {
            kind: 'edit',
            status: 'completed',
            content: [
              {
                type: 'diff',
                path: '/notes/test.md',
                oldText: '```<old>',
                newText: '<script>literal</script>',
              },
              { type: 'terminal', terminalId: 'term-42' },
              {
                type: 'content',
                content: {
                  type: 'resource_link',
                  name: '参考',
                  uri: 'resource://note',
                },
              },
            ],
          },
        }}
      />,
    );
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('+ <script>literal</script>')).toBeTruthy();
    expect(screen.getByText('终端 · term-42')).toBeTruthy();
    expect(screen.getByText('参考 · resource://note')).toBeTruthy();
  });
});
