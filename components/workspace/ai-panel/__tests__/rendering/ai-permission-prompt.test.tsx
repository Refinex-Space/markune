import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

import { AiPermissionPrompt } from '../../rendering/ai-permission-prompt';
import type { PermissionRequestChunk } from '../../ai-contracts';

function request(overrides: Partial<PermissionRequestChunk> = {}): PermissionRequestChunk {
  return {
    type: 'permission-request',
    requestId: 'r1',
    toolCallId: 't1',
    toolName: 'Bash',
    toolInput: { command: 'ls -la' },
    reason: '执行命令',
    ...overrides,
  };
}

describe('AiPermissionPrompt', () => {
  it('显示工具名与原因', () => {
    const { getByText } = render(
      <AiPermissionPrompt request={request()} onAllow={() => {}} onDeny={() => {}} />,
    );
    expect(getByText('请求授权：Bash')).toBeTruthy();
    expect(getByText('执行命令')).toBeTruthy();
  });

  it('显示工具输入摘要', () => {
    const { getByText } = render(
      <AiPermissionPrompt request={request()} onAllow={() => {}} onDeny={() => {}} />,
    );
    expect(getByText(/command: ls -la/)).toBeTruthy();
  });

  it('点击允许触发 onAllow(requestId)', () => {
    const onAllow = vi.fn();
    const { getByText } = render(
      <AiPermissionPrompt request={request()} onAllow={onAllow} onDeny={() => {}} />,
    );
    getByText('允许').click();
    expect(onAllow).toHaveBeenCalledWith('r1');
  });

  it('点击拒绝触发 onDeny(requestId)', () => {
    const onDeny = vi.fn();
    const { getByText } = render(
      <AiPermissionPrompt request={request()} onAllow={() => {}} onDeny={onDeny} />,
    );
    getByText('拒绝').click();
    expect(onDeny).toHaveBeenCalledWith('r1');
  });

  it('suggestions 渲染为快捷按钮', () => {
    const onAllow = vi.fn();
    const { getByText } = render(
      <AiPermissionPrompt
        request={request({
          suggestions: [{ id: 's1', label: '仅本次允许', description: '只允许这一次' }],
        })}
        onAllow={onAllow}
        onDeny={() => {}}
      />,
    );
    getByText('仅本次允许').click();
    expect(onAllow).toHaveBeenCalledWith('r1');
  });

  it('长输入截断显示', () => {
    const longCmd = 'x'.repeat(100);
    const { container } = render(
      <AiPermissionPrompt
        request={request({ toolInput: { command: longCmd } })}
        onAllow={() => {}}
        onDeny={() => {}}
      />,
    );
    const mono = container.querySelector('.font-mono');
    expect(mono?.textContent).toContain('...');
  });
});
