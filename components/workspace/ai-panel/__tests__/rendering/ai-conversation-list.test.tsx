import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

import { AiConversationList } from '../../rendering/ai-conversation-list';
import type { AiConversationSummaryV2 } from '../../ai-session-store';

function summary(overrides: Partial<AiConversationSummaryV2> = {}): AiConversationSummaryV2 {
  return {
    id: 'c1',
    title: '测试对话',
    profileId: 'p1',
    providerId: 'local',
    createdAt: 1000,
    updatedAt: 2000,
    messageCount: 5,
    ...overrides,
  };
}

describe('AiConversationList', () => {
  it('渲染对话列表', () => {
    const summaries = [
      summary({ id: 'c1', title: '对话一' }),
      summary({ id: 'c2', title: '对话二' }),
    ];
    const { getByText } = render(
      <AiConversationList
        summaries={summaries}
        currentId="c1"
        searchQuery=""
        loading={false}
        onSearchChange={() => {}}
        onSelect={() => {}}
        onCreate={() => {}}
      />,
    );
    expect(getByText('对话一')).toBeTruthy();
    expect(getByText('对话二')).toBeTruthy();
  });

  it('当前选中项高亮', () => {
    const { container } = render(
      <AiConversationList
        summaries={[summary({ id: 'c1' })]}
        currentId="c1"
        searchQuery=""
        loading={false}
        onSearchChange={() => {}}
        onSelect={() => {}}
        onCreate={() => {}}
      />,
    );
    const selected = container.querySelector('.border-primary');
    expect(selected).not.toBeNull();
  });

  it('点击对话触发 onSelect', () => {
    const onSelect = vi.fn();
    const { getByText } = render(
      <AiConversationList
        summaries={[summary({ id: 'c1', title: '点我' })]}
        currentId={null}
        searchQuery=""
        loading={false}
        onSearchChange={() => {}}
        onSelect={onSelect}
        onCreate={() => {}}
      />,
    );
    getByText('点我').click();
    expect(onSelect).toHaveBeenCalledWith('c1');
  });

  it('新建按钮触发 onCreate', () => {
    const onCreate = vi.fn();
    const { getByText } = render(
      <AiConversationList
        summaries={[]}
        currentId={null}
        searchQuery=""
        loading={false}
        onSearchChange={() => {}}
        onSelect={() => {}}
        onCreate={onCreate}
      />,
    );
    getByText('+ 新建对话').click();
    expect(onCreate).toHaveBeenCalled();
  });

  it('搜索框输入触发 onSearchChange', () => {
    const onSearchChange = vi.fn();
    const { getByPlaceholderText } = render(
      <AiConversationList
        summaries={[]}
        currentId={null}
        searchQuery=""
        loading={false}
        onSearchChange={onSearchChange}
        onSelect={() => {}}
        onCreate={() => {}}
      />,
    );
    const input = getByPlaceholderText('搜索对话…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '关键词' } });
    expect(onSearchChange).toHaveBeenCalled();
  });

  it('空列表显示提示', () => {
    const { getByText } = render(
      <AiConversationList
        summaries={[]}
        currentId={null}
        searchQuery=""
        loading={false}
        onSearchChange={() => {}}
        onSelect={() => {}}
        onCreate={() => {}}
      />,
    );
    expect(getByText('暂无对话')).toBeTruthy();
  });

  it('搜索无结果显示无匹配', () => {
    const { getByText } = render(
      <AiConversationList
        summaries={[]}
        currentId={null}
        searchQuery="不存在的"
        loading={false}
        onSearchChange={() => {}}
        onSelect={() => {}}
        onCreate={() => {}}
      />,
    );
    expect(getByText('无匹配对话')).toBeTruthy();
  });

  it('显示消息数与文档标题', () => {
    const { getByText } = render(
      <AiConversationList
        summaries={[summary({ id: 'c1', messageCount: 12, documentTitle: '我的笔记.md' })]}
        currentId={null}
        searchQuery=""
        loading={false}
        onSearchChange={() => {}}
        onSelect={() => {}}
        onCreate={() => {}}
      />,
    );
    expect(getByText('12 条消息')).toBeTruthy();
    expect(getByText('我的笔记.md')).toBeTruthy();
  });
});
