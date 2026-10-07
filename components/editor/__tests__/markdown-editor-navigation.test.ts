import { describe, expect, it, vi } from 'vitest';
import type { getMarkweaveDocumentViewportCoordinator } from 'markweave';
type MarkweaveDocumentViewportCoordinator = NonNullable<
  ReturnType<typeof getMarkweaveDocumentViewportCoordinator>
>;
import { settleEditorNavigation } from '../markdown-editor-navigation';
function fixture() {
  const target = { top: 1200, bottom: 1220 };
  const coordinator = {
    snapshot: { state: 'idle', pendingVisualWork: 0 },
    nextFrame: vi.fn(async () => true),
    editor: { view: { coordsAtPos: () => target } },
    getVisibleBounds: () => ({ top: 0, bottom: 600 }),
    revealPosition: vi.fn(async () => {
      target.top = 250;
      target.bottom = 270;
      return { status: 'revealed' };
    }),
  };
  return {
    coordinator,
    typed: coordinator as unknown as MarkweaveDocumentViewportCoordinator,
    target,
  };
}
describe('search navigation after virtual layout settles', () => {
  it('corrects a displaced target without resetting the selection', async () => {
    const { coordinator, typed } = fixture();
    const signal = new AbortController().signal;
    expect(
      await settleEditorNavigation(
        typed,
        30,
        signal,
        () => true,
        () => false,
      ),
    ).toBe(true);
    expect(coordinator.revealPosition).toHaveBeenCalledExactlyOnceWith(30, {
      reason: 'host',
      align: 'center',
      focus: false,
      signal,
    });
  });
  it('waits for idle layout and pending visual work before measuring', async () => {
    const { coordinator, typed, target } = fixture();
    target.top = 250;
    target.bottom = 270;
    coordinator.snapshot.pendingVisualWork = 1;
    coordinator.nextFrame.mockImplementation(async () => {
      coordinator.snapshot.pendingVisualWork = 0;
      return true;
    });
    expect(
      await settleEditorNavigation(
        typed,
        30,
        new AbortController().signal,
        () => true,
        () => false,
      ),
    ).toBe(true);
    expect(coordinator.nextFrame).toHaveBeenCalledTimes(2);
    expect(coordinator.revealPosition).not.toHaveBeenCalled();
  });
  it('yields to user interaction without taking focus back', async () => {
    const { coordinator, typed } = fixture();
    let interrupted = false;
    coordinator.nextFrame.mockImplementation(async () => {
      interrupted = true;
      return true;
    });
    expect(
      await settleEditorNavigation(
        typed,
        30,
        new AbortController().signal,
        () => true,
        () => interrupted,
      ),
    ).toBe(true);
    expect(coordinator.revealPosition).not.toHaveBeenCalled();
  });
  it('rejects cancellation and stale requests before applying a correction', async () => {
    const { coordinator, typed } = fixture();
    const controller = new AbortController();
    coordinator.nextFrame.mockImplementation(async () => {
      controller.abort();
      return true;
    });
    expect(
      await settleEditorNavigation(
        typed,
        30,
        controller.signal,
        () => true,
        () => false,
      ),
    ).toBe(false);
    expect(
      await settleEditorNavigation(
        typed,
        30,
        new AbortController().signal,
        () => false,
        () => false,
      ),
    ).toBe(false);
    expect(coordinator.revealPosition).not.toHaveBeenCalled();
  });
});
