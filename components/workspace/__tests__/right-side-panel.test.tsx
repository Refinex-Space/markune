import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RightSidePanel, RightToolRail } from '../right-side-panel';

vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme: vi.fn(), theme: 'light' }),
}));

vi.mock('../ai-panel', () => ({
  AiPanel: ({
    onOpenDocument,
    onOpenPlanPreview,
    presentation,
    visible,
    workspaceRootPath,
  }: {
    onOpenDocument: (path: string) => void;
    onOpenPlanPreview: (
      plan: { id: string; text: string },
      threadId: string,
    ) => void;
    presentation: 'panel' | 'workspace';
    visible: boolean;
    workspaceRootPath: string | null;
  }) => (
    <div data-presentation={presentation} data-visible={visible}>
      AI:{workspaceRootPath}
      <button type="button" onClick={() => onOpenDocument('/workspace/README.md')}>
        打开提及文档
      </button>
      <button
        type="button"
        onClick={() =>
          onOpenPlanPreview(
            { id: 'plan-1', text: '# 计划' },
            'thread-1',
          )
        }
      >
        打开计划
      </button>
    </div>
  ),
}));

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('right AI panel integration', () => {
  it('在 AI 与元信息模式之间保持互斥切换', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    const { rerender } = render(
      <RightToolRail
        mode={null}
        onModeChange={onModeChange}
        onOpenSettings={vi.fn()}
      />,
    );

    const aiPanelButton = screen.getByTestId('ai-panel-icon-button');
    const aiPanelIcon = aiPanelButton.querySelector('svg');
    expect(aiPanelIcon?.getAttribute('viewBox')).toBe('0 0 256 260');
    expect(aiPanelIcon?.getAttribute('class')).toContain('size-[17px]');
    expect(aiPanelIcon?.getAttribute('fill')).toBe('currentColor');

    await user.click(screen.getByRole('button', { name: '展开 AI 面板' }));
    expect(onModeChange).toHaveBeenLastCalledWith('ai');

    await user.click(screen.getByRole('button', { name: '展开元信息面板' }));
    expect(onModeChange).toHaveBeenLastCalledWith('meta');

    rerender(
      <RightToolRail
        mode="ai"
        onModeChange={onModeChange}
        onOpenSettings={vi.fn()}
      />,
    );
    const activeAiButtonClasses = screen
      .getByTestId('ai-panel-icon-button')
      .className.split(/\s+/);
    expect(activeAiButtonClasses).not.toContain('bg-accent');
    expect(activeAiButtonClasses).not.toContain('text-foreground');
    await user.click(screen.getByRole('button', { name: '折叠 AI 面板' }));
    expect(onModeChange).toHaveBeenLastCalledWith(null);
  });

  it('AI 模式渲染工作区级面板而不是元信息面板', () => {
    const onOpenDocument = vi.fn();
    const onOpenPlanPreview = vi.fn();
    render(
      <RightSidePanel
        currentDocument={null}
        currentDocumentPath={null}
        documentPanelData={null}
        documentReadOnly={false}
        documents={[]}
        aiPresentation="panel"
        mode="ai"
        width={420}
        workspaceRootPath="/workspace"
        onBeforeTurnStart={vi.fn().mockResolvedValue(true)}
        onOpenDocument={onOpenDocument}
        onOpenPlanPreview={onOpenPlanPreview}
        onWorkspaceChanged={vi.fn()}
      />,
    );

    expect(screen.getByTestId('ai-side-panel')).toBeTruthy();
    expect(
      screen.getByTestId('ai-side-panel').getAttribute('data-presentation'),
    ).toBe('panel');
    expect(screen.getByText('AI:/workspace')).toBeTruthy();
    expect(screen.queryByTestId('document-meta-panel')).toBeNull();
    screen.getByRole('button', { name: '打开提及文档' }).click();
    expect(onOpenDocument).toHaveBeenCalledWith('/workspace/README.md');
    screen.getByRole('button', { name: '打开计划' }).click();
    expect(onOpenPlanPreview).toHaveBeenCalledWith(
      { id: 'plan-1', text: '# 计划' },
      'thread-1',
    );
  });

  it('折叠或切换元信息面板时仍保持 AI 运行时挂载', () => {
    const props = {
      currentDocument: null,
      currentDocumentPath: null,
      documentPanelData: null,
      documentReadOnly: false,
      documents: [],
      aiPresentation: 'panel' as const,
      width: 420,
      workspaceRootPath: '/workspace',
      onBeforeTurnStart: vi.fn().mockResolvedValue(true),
      onOpenDocument: vi.fn(),
      onOpenPlanPreview: vi.fn(),
      onWorkspaceChanged: vi.fn(),
    };
    const { rerender } = render(<RightSidePanel {...props} mode={null} />);

    const hiddenAiPanel = screen.getByTestId('ai-side-panel');
    expect(hiddenAiPanel.hasAttribute('hidden')).toBe(true);
    expect(screen.getByText('AI:/workspace').getAttribute('data-visible')).toBe(
      'false',
    );

    rerender(<RightSidePanel {...props} mode="meta" />);

    expect(screen.getByTestId('ai-side-panel')).toBe(hiddenAiPanel);
    expect(screen.getByTestId('ai-side-panel').hasAttribute('hidden')).toBe(
      true,
    );
    expect(screen.getByTestId('document-meta-panel')).toBeTruthy();
  });

  it('在紧凑侧栏和 Codex 工作区之间复用同一个 AI 面板实例', () => {
    const props = {
      currentDocument: null,
      currentDocumentPath: null,
      documentPanelData: null,
      documentReadOnly: false,
      documents: [],
      mode: 'ai' as const,
      width: 420,
      workspaceRootPath: '/workspace',
      onBeforeTurnStart: vi.fn().mockResolvedValue(true),
      onOpenDocument: vi.fn(),
      onOpenPlanPreview: vi.fn(),
      onWorkspaceChanged: vi.fn(),
    };
    const { rerender } = render(
      <RightSidePanel {...props} aiPresentation="panel" />,
    );

    const aiPanel = screen.getByText('AI:/workspace').parentElement;
    const compactSurface = screen.getByTestId('ai-side-panel');
    expect(compactSurface.getAttribute('data-presentation')).toBe('panel');

    rerender(
      <RightSidePanel
        {...props}
        aiPresentation="workspace"
        aiWorkspacePreview={<div>文档预览</div>}
        aiWorkspacePreviewWidth={720}
        onAiWorkspacePreviewResize={vi.fn()}
      />,
    );

    expect(screen.getByTestId('ai-side-panel')).toBe(compactSurface);
    expect(screen.getByText('AI:/workspace').parentElement).toBe(aiPanel);
    expect(
      screen.getByTestId('ai-side-panel').getAttribute('data-presentation'),
    ).toBe('workspace');
    expect(screen.getByText('文档预览')).toBeTruthy();
    const previewShell = screen.getByRole('complementary', {
      name: '文档预览',
    });
    expect(previewShell.style.width).toBe('720px');
    expect(previewShell.className).toContain('absolute');
    expect(previewShell.className).toContain('top-1');
    expect(previewShell.className).toContain('bottom-1');
    expect(previewShell.className).toContain('right-2');
    expect(previewShell.className).toContain('z-40');
    expect(previewShell.className).toContain('rounded-lg');
    expect(previewShell.className).toContain(
      'shadow-[0_8px_24px_-18px_rgba(15,23,42,0.28)]',
    );
    expect(previewShell.className).toContain('slide-in-from-right-4');
    expect(previewShell.className).not.toContain('min-[1440px]:static');

    const resizeHandle = screen.getByRole('separator', {
      name: '调整文档预览宽度',
    });
    expect(resizeHandle.getAttribute('aria-valuemin')).toBe('520');
    expect(resizeHandle.getAttribute('aria-valuemax')).toBe('960');
    expect(resizeHandle.getAttribute('aria-valuenow')).toBe('720');
    expect(resizeHandle.className).toContain('absolute!');
    expect(resizeHandle.className).toContain('[&>span]:hidden');
    expect(screen.getByText('文档预览').parentElement?.className).not.toContain(
      'border-l',
    );
  });
});
