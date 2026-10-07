import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'light',
    resolvedTheme: 'light',
    setTheme: vi.fn(),
  }),
}));

vi.mock('../ai-panel', () => ({
  AiPanel: ({ presentation }: { presentation: string }) => {
    const [draft, setDraft] = React.useState('');
    return (
      <section data-testid="codex-test-chat" data-presentation={presentation}>
        <textarea
          aria-label="Codex 草稿"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </section>
    );
  },
}));

import { WorkspaceLayout } from '../workspace-layout';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    })),
  );
  window.localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

const snapshot = {
  rootPath: '/codex-sidebar-test',
  rootName: '测试工作区',
  nodes: [
    {
      id: 'docs',
      name: '文档目录',
      kind: 'directory' as const,
      relativePath: 'docs',
      absolutePath: '/codex-sidebar-test/docs',
      children: [],
    },
  ],
};

describe('Codex fullscreen sidebar boundary', () => {
  it('keeps the sidebar outside the fullscreen containing block through collapse and expansion', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);
    await user.click(
      screen.getByRole('button', { name: 'Codex', exact: true }),
    );
    const sidebar = screen.getByTestId('workspace-sidebar');
    const region = screen.getByTestId('workspace-content-region');
    const surface = screen.getByTestId('ai-side-panel');
    expect(region.contains(sidebar)).toBe(false);
    expect(region.contains(surface)).toBe(true);
    expect(region.contains(screen.getByTestId('workspace-editor-column'))).toBe(
      true,
    );
    await user.click(screen.getByRole('button', { name: '折叠侧边栏' }));
    expect(sidebar.style.width).toBe('0px');
    await user.click(screen.getByRole('button', { name: '展开侧边栏' }));
    await waitFor(() => expect(sidebar.style.width).not.toBe('0px'));
    expect(region.contains(sidebar)).toBe(false);
    expect(screen.getByTestId('ai-side-panel')).toBe(surface);
  });

  it('retains the AI instance and draft while switching presentation and opening the sidebar', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);
    const chat = screen.getByTestId('codex-test-chat');
    await user.click(screen.getByRole('button', { name: '展开 AI 面板' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Codex 草稿' }),
      '保留这份草稿',
    );
    await user.click(
      screen.getByRole('button', { name: 'Codex', exact: true }),
    );
    await user.click(screen.getByRole('button', { name: '折叠侧边栏' }));
    await user.click(screen.getByRole('button', { name: '展开侧边栏' }));
    expect(screen.getByTestId('codex-test-chat')).toBe(chat);
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Codex 草稿',
        }) as HTMLTextAreaElement
      ).value,
    ).toBe('保留这份草稿');
    await user.click(screen.getByRole('button', { name: '折叠 AI 面板' }));
    expect(screen.getByTestId('codex-test-chat')).toBe(chat);
  });
});
