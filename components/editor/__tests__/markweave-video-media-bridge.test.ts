import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installMarkweaveVideoMediaBridge } from '@/components/editor/markweave-video-media-bridge';

class TestIntersectionObserver implements IntersectionObserver {
  static instances: TestIntersectionObserver[] = [];

  readonly root = null;
  readonly rootMargin: string;
  readonly thresholds = [0];
  private readonly callback: IntersectionObserverCallback;
  private readonly observed = new Set<Element>();

  constructor(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.callback = callback;
    this.rootMargin = options?.rootMargin ?? '0px';
    TestIntersectionObserver.instances.push(this);
  }

  disconnect() {
    this.observed.clear();
  }

  observe(target: Element) {
    this.observed.add(target);
  }

  takeRecords() {
    return [];
  }

  unobserve(target: Element) {
    this.observed.delete(target);
  }

  trigger(
    target: Element,
    {
      bottom = 100,
      isIntersecting = true,
      top = 0,
    }: {
      bottom?: number;
      isIntersecting?: boolean;
      top?: number;
    } = {},
  ) {
    if (!this.observed.has(target)) {
      return;
    }

    const rect = {
      bottom,
      height: bottom - top,
      left: 0,
      right: 100,
      top,
      width: 100,
      x: 0,
      y: top,
      toJSON: () => ({}),
    } as DOMRectReadOnly;
    this.callback(
      [
        {
          boundingClientRect: rect,
          intersectionRatio: isIntersecting ? 1 : 0,
          intersectionRect: rect,
          isIntersecting,
          rootBounds: null,
          target,
          time: 0,
        },
      ],
      this,
    );
  }
}

function createVideoFixture(src = 'markune-asset://video-a') {
  const root = document.createElement('div');
  const figure = document.createElement('figure');
  figure.className = 'markweave-video-node';
  const video = document.createElement('video');
  video.dataset.markweaveVideo = 'true';
  video.setAttribute('src', src);
  figure.append(video);
  root.append(figure);
  document.body.append(root);
  return { root, video };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('Markweave local video media bridge', () => {
  const cleanups: Array<() => void> = [];
  const originalIntersectionObserver = window.IntersectionObserver;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    TestIntersectionObserver.instances = [];
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: TestIntersectionObserver,
      writable: true,
    });
  });

  afterEach(() => {
    cleanups.splice(0).reverse().forEach((cleanup) => cleanup());
    document.body.replaceChildren();
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: originalIntersectionObserver,
      writable: true,
    });
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('仅在进入视口后解析本地视频，并以真实 metadata load 确认成功', async () => {
    const { root, video } = createVideoFixture();
    const resolver = vi.fn().mockResolvedValue({
      src: 'asset://localhost/video-a.mp4',
    });
    const cleanup = installMarkweaveVideoMediaBridge(root, resolver);
    cleanups.push(cleanup);

    expect(video.hasAttribute('src')).toBe(false);
    expect(video.dataset.mediaState).toBe('pending');
    expect(resolver).not.toHaveBeenCalled();

    TestIntersectionObserver.instances[0]?.trigger(video);
    await flushMicrotasks();

    expect(resolver).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        kind: 'video',
        priority: 'visible',
        reason: 'viewport',
        src: 'markune-asset://video-a',
      }),
    );
    expect(video.getAttribute('src')).toBe(
      'asset://localhost/video-a.mp4',
    );
    expect(video.dataset.mediaState).toBe('pending');

    video.dispatchEvent(new Event('loadedmetadata'));
    expect(video.dataset.mediaState).toBe('resolved');
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();

    cleanup();
    cleanups.pop();
    expect(video.hasAttribute('src')).toBe(false);
  });

  it('候选视频加载失败后使用递增 attempt 和 retry reason 有限重试', async () => {
    const { root, video } = createVideoFixture();
    const resolver = vi
      .fn()
      .mockResolvedValueOnce({ src: 'asset://localhost/broken.mp4' })
      .mockResolvedValueOnce({ src: 'asset://localhost/recovered.mp4' });
    cleanups.push(installMarkweaveVideoMediaBridge(root, resolver));

    TestIntersectionObserver.instances[0]?.trigger(video);
    await flushMicrotasks();
    video.dispatchEvent(new Event('error'));

    expect(video.dataset.mediaState).toBe('pending');
    expect(video.hasAttribute('src')).toBe(false);
    vi.advanceTimersByTime(249);
    expect(resolver).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await flushMicrotasks();
    expect(resolver).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attempt: 2,
        kind: 'video',
        reason: 'retry',
      }),
    );
    expect(video.getAttribute('src')).toBe(
      'asset://localhost/recovered.mp4',
    );

    video.dispatchEvent(new Event('loadedmetadata'));
    expect(video.dataset.mediaState).toBe('resolved');
  });

  it('output barrier 会唤醒离屏视频并等待真实 metadata load', async () => {
    const { root, video } = createVideoFixture();
    const resolver = vi.fn().mockResolvedValue({
      src: 'asset://localhost/output.mp4',
    });
    cleanups.push(installMarkweaveVideoMediaBridge(root, resolver));
    const outputController = new AbortController();
    const waiters: PromiseLike<unknown>[] = [];

    root.dispatchEvent(
      new CustomEvent('markweave:prepare-output', {
        bubbles: true,
        detail: {
          signal: outputController.signal,
          waitUntil: (promise: PromiseLike<unknown>) => waiters.push(promise),
        },
      }),
    );
    await flushMicrotasks();

    expect(resolver).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        kind: 'video',
        priority: 'visible',
        reason: 'output',
      }),
    );
    expect(waiters).toHaveLength(1);

    let settled = false;
    void Promise.all(waiters).then(() => {
      settled = true;
    });
    await flushMicrotasks();
    expect(settled).toBe(false);

    video.dispatchEvent(new Event('loadedmetadata'));
    await Promise.all(waiters);
    expect(settled).toBe(true);
    expect(video.dataset.mediaState).toBe('resolved');
  });

  it('output 首次失败后保持 waiter，并以 output/visible 完成恢复', async () => {
    const { root, video } = createVideoFixture();
    const resolver = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ src: 'asset://localhost/output-retry.mp4' });
    cleanups.push(installMarkweaveVideoMediaBridge(root, resolver));
    const outputController = new AbortController();
    const waiters: PromiseLike<unknown>[] = [];

    root.dispatchEvent(
      new CustomEvent('markweave:prepare-output', {
        detail: {
          signal: outputController.signal,
          waitUntil: (promise: PromiseLike<unknown>) => waiters.push(promise),
        },
      }),
    );
    await flushMicrotasks();

    let settled = false;
    void Promise.all(waiters).then(() => {
      settled = true;
    });
    await flushMicrotasks();
    expect(settled).toBe(false);
    expect(video.dataset.mediaState).toBe('pending');
    expect(video.hasAttribute('src')).toBe(false);

    vi.advanceTimersByTime(250);
    await flushMicrotasks();
    expect(resolver).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attempt: 2,
        kind: 'video',
        priority: 'visible',
        reason: 'output',
      }),
    );
    expect(settled).toBe(false);

    video.dispatchEvent(new Event('loadedmetadata'));
    await Promise.all(waiters);
    expect(settled).toBe(true);
    expect(video.dataset.mediaState).toBe('resolved');
  });

  it('output 在重试间隙取消后清理 timer，且不产生晚到请求', async () => {
    const { root, video } = createVideoFixture();
    const resolver = vi.fn().mockResolvedValue(null);
    cleanups.push(installMarkweaveVideoMediaBridge(root, resolver));
    const outputController = new AbortController();
    const waiters: PromiseLike<unknown>[] = [];

    root.dispatchEvent(
      new CustomEvent('markweave:prepare-output', {
        detail: {
          signal: outputController.signal,
          waitUntil: (promise: PromiseLike<unknown>) => waiters.push(promise),
        },
      }),
    );
    await flushMicrotasks();
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(video.dataset.mediaState).toBe('pending');

    outputController.abort();
    await Promise.all(waiters);
    vi.advanceTimersByTime(2_000);
    await flushMicrotasks();

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(video.dataset.mediaState).toBe('missing');
    expect(video.hasAttribute('src')).toBe(false);

    video.setAttribute('src', 'markune-asset://video-a');
    await flushMicrotasks();
    expect(video.hasAttribute('src')).toBe(false);
  });

  it('自动重试耗尽后仍可在 warm Tab 再次进入视口时恢复', async () => {
    const { root, video } = createVideoFixture();
    const resolver = vi
      .fn()
      .mockResolvedValueOnce({ src: 'asset://localhost/failed-1.mp4' })
      .mockResolvedValueOnce({ src: 'asset://localhost/failed-2.mp4' })
      .mockResolvedValueOnce({ src: 'asset://localhost/failed-3.mp4' })
      .mockResolvedValueOnce({ src: 'asset://localhost/recovered.mp4' });
    cleanups.push(installMarkweaveVideoMediaBridge(root, resolver));
    const observer = TestIntersectionObserver.instances[0];

    observer?.trigger(video);
    await flushMicrotasks();
    video.dispatchEvent(new Event('error'));
    vi.advanceTimersByTime(250);
    await flushMicrotasks();
    video.dispatchEvent(new Event('error'));
    vi.advanceTimersByTime(1_000);
    await flushMicrotasks();
    video.dispatchEvent(new Event('error'));
    expect(resolver).toHaveBeenCalledTimes(3);
    expect(video.dataset.mediaState).toBe('unreadable');
    expect(video.hasAttribute('src')).toBe(false);

    observer?.trigger(video, { isIntersecting: false });
    observer?.trigger(video, { isIntersecting: true });
    await flushMicrotasks();

    expect(resolver).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attempt: 4,
        kind: 'video',
        reason: 'viewport',
      }),
    );
    expect(video.getAttribute('src')).toBe(
      'asset://localhost/recovered.mp4',
    );
  });

  it('已成功候选在 warm Tab 中失效后会重新解析', async () => {
    const { root, video } = createVideoFixture();
    const resolver = vi
      .fn()
      .mockResolvedValueOnce({ src: 'asset://localhost/expired.mp4' })
      .mockResolvedValueOnce({ src: 'asset://localhost/refreshed.mp4' });
    cleanups.push(installMarkweaveVideoMediaBridge(root, resolver));

    TestIntersectionObserver.instances[0]?.trigger(video);
    await flushMicrotasks();
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(video.dataset.mediaState).toBe('resolved');

    video.dispatchEvent(new Event('error'));
    await flushMicrotasks();

    expect(resolver).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attempt: 2,
        kind: 'video',
        priority: 'visible',
        reason: 'retry',
      }),
    );
    expect(video.getAttribute('src')).toBe(
      'asset://localhost/refreshed.mp4',
    );
  });

  it('持久化视频源变化时取消旧请求并忽略晚到候选', async () => {
    const { root, video } = createVideoFixture();
    const first = deferred<{ src: string }>();
    const second = deferred<{ src: string }>();
    const resolver = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    cleanups.push(installMarkweaveVideoMediaBridge(root, resolver));
    const observer = TestIntersectionObserver.instances[0];

    observer?.trigger(video);
    await flushMicrotasks();
    const firstSignal = resolver.mock.calls[0]?.[0].signal as AbortSignal;

    video.setAttribute('src', 'markune-asset://video-b');
    await flushMicrotasks();
    expect(firstSignal.aborted).toBe(true);

    observer?.trigger(video);
    await flushMicrotasks();
    first.resolve({ src: 'asset://localhost/stale-a.mp4' });
    second.resolve({ src: 'asset://localhost/video-b.mp4' });
    await flushMicrotasks();

    expect(resolver).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attempt: 1,
        kind: 'video',
        src: 'markune-asset://video-b',
      }),
    );
    expect(video.getAttribute('src')).toBe(
      'asset://localhost/video-b.mp4',
    );
  });

  it('远程视频保持 Markweave 原生行为，不进入本地解析桥接', () => {
    const { root, video } = createVideoFixture(
      'https://cdn.example.com/video.mp4',
    );
    const resolver = vi.fn();
    cleanups.push(installMarkweaveVideoMediaBridge(root, resolver));

    expect(video.getAttribute('src')).toBe(
      'https://cdn.example.com/video.mp4',
    );
    expect(video.dataset.mediaState).toBeUndefined();
    expect(resolver).not.toHaveBeenCalled();
  });
});
