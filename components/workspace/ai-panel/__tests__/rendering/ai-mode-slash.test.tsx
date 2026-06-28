import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

import {
  AiModeSelector,
  getNextMode,
  type AiMode,
} from '../../rendering/ai-mode-selector';
import {
  AiSlashCommandPopover,
  detectSlashTrigger,
  filterSlashCommands,
  type SlashCommandOption,
} from '../../rendering/ai-slash-command';

describe('AiModeSelector', () => {
  it('渲染两个模式按钮，当前模式高亮', () => {
    const { getByText, container } = render(
      <AiModeSelector mode="agent" onChange={() => {}} />,
    );
    expect(getByText('执行')).toBeTruthy();
    expect(getByText('规划')).toBeTruthy();
    // agent 高亮（bg-background）
    const agentBtn = getByText('执行').closest('button');
    expect(agentBtn?.className).toContain('bg-background');
  });

  it('点击切换触发 onChange', () => {
    const onChange = vi.fn();
    const { getByText } = render(<AiModeSelector mode="agent" onChange={onChange} />);
    getByText('规划').click();
    expect(onChange).toHaveBeenCalledWith('plan');
  });

  it('getNextMode 循环', () => {
    expect(getNextMode('agent')).toBe('plan');
    expect(getNextMode('plan')).toBe('agent');
  });
});

describe('detectSlashTrigger', () => {
  it('以 / 开头返回命令名', () => {
    expect(detectSlashTrigger('/plan')).toBe('plan');
    expect(detectSlashTrigger('/cl')).toBe('cl');
  });

  it('非 / 开头返回 null', () => {
    expect(detectSlashTrigger('hello')).toBeNull();
    expect(detectSlashTrigger('')).toBeNull();
  });

  it('含空格时仍取首个 token', () => {
    expect(detectSlashTrigger('/clear all')).toBe('clear');
  });
});

describe('filterSlashCommands', () => {
  const options: SlashCommandOption[] = [
    { name: 'clear', description: '清空对话' },
    { name: 'plan', description: '进入规划模式' },
    { name: 'agent', description: '进入执行模式' },
  ];

  it('空 query 返回全部', () => {
    expect(filterSlashCommands(options, '')).toHaveLength(3);
  });

  it('按 name 匹配', () => {
    const r = filterSlashCommands(options, 'pl');
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('plan');
  });

  it('按 description 匹配', () => {
    const r = filterSlashCommands(options, '清空');
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('clear');
  });
});

describe('AiSlashCommandPopover', () => {
  const options: SlashCommandOption[] = [
    { name: 'clear', description: '清空' },
    { name: 'plan', description: '规划' },
  ];

  it('渲染命令列表', () => {
    const { getByText } = render(
      <AiSlashCommandPopover options={options} onSelect={() => {}} onClose={() => {}} />,
    );
    expect(getByText('/clear')).toBeTruthy();
    expect(getByText('/plan')).toBeTruthy();
  });

  it('点击触发 onSelect', () => {
    const onSelect = vi.fn();
    const { getByText } = render(
      <AiSlashCommandPopover options={options} onSelect={onSelect} onClose={() => {}} />,
    );
    getByText('/plan').click();
    expect(onSelect).toHaveBeenCalledWith(options[1]);
  });

  it('空选项不渲染', () => {
    const { container } = render(
      <AiSlashCommandPopover options={[]} onSelect={() => {}} onClose={() => {}} />,
    );
    expect(container.querySelector('.ai-slash-command-popover')).toBeNull();
  });
});
