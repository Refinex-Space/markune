import * as React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MarkweaveEditor } from '@markweave/react';
import { getMarkweaveDocumentViewportCoordinatorForElement } from 'markweave';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('published Markweave image scheduling', () => {
  it('合并快速滚动期间的重复唤醒，并让出主线程完成图片加载', async () => {
    let imageTop = window.innerHeight * 8;
    let scrollY = 0;
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = this.classList.contains('markweave-image-node') ? imageTop : 0;
      return { top, bottom: top + 200, left: 0, right: 400, width: 400, height: 200, x: 0, y: top, toJSON: () => ({}) };
    });
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.stubGlobal('requestIdleCallback', () => 1);
    vi.stubGlobal('cancelIdleCallback', () => {});
    const resolver = vi.fn(() => ({ src: 'asset://fixture/resolved.png' }));
    let ready = false;
    const view = render(
      <MarkweaveEditor
        defaultContent={'# 图片调度回归\n\n![图片](markune-asset://fixture)\n\n尾部正文'}
        resolveMediaSource={resolver}
        onDocumentLoadStateChange={(state) => { ready = state.phase === 'ready'; }}
      />,
    );
    try {
      await waitFor(() => expect(ready).toBe(true));
      const coordinator = getMarkweaveDocumentViewportCoordinatorForElement(screen.getByTestId('markweave-editor-surface'))!;
      const originalMarkdown = coordinator.editor.getMarkdown();
      const schedule = coordinator.visualWork.schedule.bind(coordinator.visualWork);
      const jobs: ReturnType<typeof schedule>[] = [];
      vi.spyOn(coordinator.visualWork, 'schedule').mockImplementation((task) => {
        // author: refinex — fail boundedly on an older package instead of hanging the runner.
        if (jobs.length >= 20) coordinator.editor.destroy();
        const job = schedule(task);
        jobs.push(job);
        return job;
      });
      await act(async () => {
        window.dispatchEvent(new Event('scroll'));
        scrollY = 100;
        window.dispatchEvent(new Event('scroll'));
        expect(coordinator.snapshot.state).toBe('rapid');
        imageTop = window.innerHeight * 2;
        window.dispatchEvent(new Event('focus'));
        window.dispatchEvent(new Event('pageshow'));
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });
      expect(jobs).toHaveLength(2);
      expect(jobs[0].promise).toBe(jobs[1].promise);
      expect(coordinator.visualWork.pendingCount).toBe(1);
      await waitFor(() => expect(resolver).toHaveBeenCalledTimes(1));
      const image = screen.getByTestId('markweave-image-node').querySelector('img')!;
      await act(async () => { image.dispatchEvent(new Event('load')); });
      await waitFor(() => expect(coordinator.visualWork.pendingCount).toBe(0));
      expect(screen.getByTestId('markweave-image-node').dataset.mediaState).toBe('resolved');
      expect(coordinator.editor.getMarkdown()).toBe(originalMarkdown);
    } finally {
      view.unmount();
    }
  });
});
