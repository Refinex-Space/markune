import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Provider } from 'jotai';
import type { ReactNode } from 'react';

import { AiMessageList } from '../../rendering/ai-message-list';
import { AiMessageItem } from '../../rendering/ai-message-item';
import { createAiMessageStore, useSetMessageStore } from '../../ai-message-store';
import type { AiMessage } from '../../ai-contracts';
import { useEffect } from 'react';

// 辅助：在 Jotai Provider 内注入 store 后渲染子树
function renderWithStore(messages: AiMessage[], children: ReactNode) {
  function Harness() {
    const setStore = useSetMessageStore();
    const store = createAiMessageStore();
    useEffect(() => {
      store.loadMessages(messages);
      setStore(store);
    }, [store, setStore]);
    return <>{children}</>;
  }
  return render(
    <Provider>
      <Harness />
    </Provider>,
  );
}

describe('AiMessageItem', () => {
  it('user 消息渲染气泡', () => {
    const msg: AiMessage = {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: '提问' }],
      createdAt: 1,
    };
    const { container, getByText } = renderWithStore([msg], <AiMessageItem messageId="u1" />);
    expect(getByText('提问')).toBeTruthy();
    expect(container.querySelector('[data-role="user"]')).not.toBeNull();
  });

  it('assistant 消息渲染 markdown', () => {
    const msg: AiMessage = {
      id: 'a1',
      role: 'assistant',
      parts: [{ type: 'text', text: '回答' }],
      createdAt: 1,
    };
    const { getByText } = renderWithStore([msg], <AiMessageItem messageId="a1" />);
    expect(getByText('回答')).toBeTruthy();
  });

  it('未知 messageId 渲染为空', () => {
    const { container } = renderWithStore([], <AiMessageItem messageId="nope" />);
    expect(container.textContent).toBe('');
  });
});

describe('AiMessageList', () => {
  it('按顺序渲染多条消息', () => {
    const messages: AiMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: '一' }], createdAt: 1 },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: '二' }], createdAt: 2 },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: '三' }], createdAt: 3 },
    ];
    const { getByText } = renderWithStore(messages, <AiMessageList />);
    expect(getByText('一')).toBeTruthy();
    expect(getByText('二')).toBeTruthy();
    expect(getByText('三')).toBeTruthy();
  });

  it('空列表渲染为空容器', () => {
    const { container } = renderWithStore([], <AiMessageList />);
    expect(container.querySelector('.ai-message-list')).not.toBeNull();
  });
});
