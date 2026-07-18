import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { InboxSidebar } from '../inbox-sidebar';
import type { InboxController } from '../use-inbox-controller';
import type { InboxCaptureSummary } from '../workspace-types';

const capture: InboxCaptureSummary = {
  appendedTo: null,
  createdAt: '2026-07-18T06:32:05.123Z',
  id: 'cap_20260718_143205_123_a1b2c3d4',
  modifiedAt: 1,
  priority: 'normal',
  promotedTo: null,
  resolvedAt: null,
  snoozedUntil: null,
  source: 'quick-capture',
  status: 'open',
  summary: '一个还没成型的想法',
  tags: [],
  title: '一个还没成型的想法',
  updatedAt: '2026-07-18T06:32:05.123Z',
};

function createController(
  overrides: Partial<InboxController> = {},
): InboxController {
  return {
    activeCount: 1,
    appendToDaily: vi.fn(),
    capture: null,
    captures: [capture],
    error: null,
    issues: [],
    loadList: vi.fn(),
    loadingCapture: false,
    loadingList: false,
    newCaptureActive: false,
    newCaptureBody: '',
    newCaptureVersion: 0,
    promote: vi.fn(),
    query: '',
    remove: vi.fn(),
    rootPath: '/workspace',
    saveCurrent: vi.fn(),
    saveState: 'saved',
    saving: false,
    selectedId: capture.id,
    selectCapture: vi.fn(),
    setPriority: vi.fn(),
    setQuery: vi.fn(),
    setStatus: vi.fn().mockResolvedValue(undefined),
    setView: vi.fn(),
    startNewCapture: vi.fn().mockResolvedValue(true),
    updateBody: vi.fn(),
    updateNewCaptureBody: vi.fn(),
    view: 'active',
    wake: vi.fn(),
    ...overrides,
  } as InboxController;
}

function renderSidebar(controller: InboxController) {
  return render(
    <InboxSidebar
      controller={controller}
      nodes={[]}
      onDailyUpdated={vi.fn()}
      onOpenDaily={vi.fn()}
      onPromoted={vi.fn()}
    />,
  );
}

describe('InboxSidebar', () => {
  it('keeps captures compact and starts a main-editor draft from the status row', async () => {
    const user = userEvent.setup();
    const controller = createController();

    renderSidebar(controller);

    expect(screen.getByTestId('inbox-capture-row').className).toContain('h-10');
    await user.click(screen.getByTestId('inbox-new-capture-trigger'));

    expect(controller.startNewCapture).toHaveBeenCalledTimes(1);
  });

  it('exposes triage actions from the capture context menu', async () => {
    const user = userEvent.setup();
    const controller = createController();

    renderSidebar(controller);
    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByTestId('inbox-capture-row'),
    });

    expect(await screen.findByRole('menuitem', { name: /状态/ })).not.toBeNull();
    expect(screen.queryByRole('menuitem', { name: '何时查看' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: '归档' })).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: '永久删除' })).not.toBeNull();
  });

  it('uses distinct priority dot colors in the capture list', () => {
    renderSidebar(
      createController({
        captures: [
          { ...capture, id: 'high', priority: 'high', title: '高优先级' },
          { ...capture, id: 'normal', priority: 'normal', title: '普通优先级' },
          { ...capture, id: 'low', priority: 'low', title: '低优先级' },
        ],
      }),
    );

    expect(screen.getByLabelText('高优先级').className).toContain('bg-red-500');
    expect(screen.getByLabelText('普通优先级').className).toContain(
      'bg-sky-500',
    );
    expect(screen.getByLabelText('低优先级').className).toContain(
      'bg-muted-foreground/35',
    );
  });

  it('only offers recovery for legacy snoozed captures', async () => {
    const user = userEvent.setup();
    const legacyCapture = {
      ...capture,
      snoozedUntil: '2999-07-18T09:00:00.000Z',
    };
    const controller = createController({ captures: [legacyCapture] });

    renderSidebar(controller);
    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByTestId('inbox-capture-row'),
    });
    await user.click(
      await screen.findByRole('menuitem', { name: '恢复待处理' }),
    );

    expect(controller.wake).toHaveBeenCalledWith(legacyCapture.id);
  });

  it('offers unarchive for archived captures', async () => {
    const user = userEvent.setup();
    const archivedCapture = {
      ...capture,
      status: 'archived' as const,
    };
    const controller = createController({
      captures: [archivedCapture],
      view: 'archived',
    });

    renderSidebar(controller);
    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByTestId('inbox-capture-row'),
    });
    await user.click(
      await screen.findByRole('menuitem', { name: '取消归档' }),
    );

    expect(controller.setStatus).toHaveBeenCalledWith(
      archivedCapture.id,
      'open',
    );
  });
});
