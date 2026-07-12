import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  isTauriRuntimeMock,
  resolveLinkPreviewMock,
} = vi.hoisted(() => ({
  isTauriRuntimeMock: vi.fn(),
  resolveLinkPreviewMock: vi.fn(),
}));

vi.mock('@/components/workspace/workspace-api', () => ({
  isTauriRuntime: isTauriRuntimeMock,
  resolveLinkPreview: resolveLinkPreviewMock,
}));

import { resolveMarkweaveLinkCard } from '@/components/editor/markweave-link-card-resolver';

describe('Markweave 链接卡片解析器', () => {
  beforeEach(() => {
    isTauriRuntimeMock.mockReset();
    resolveLinkPreviewMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('在桌面端复用受限的 Tauri 链接预览 command', async () => {
    isTauriRuntimeMock.mockReturnValue(true);
    resolveLinkPreviewMock.mockResolvedValue({
      description: '说明',
      domain: 'example.com',
      image: 'https://example.com/cover.png',
      kind: 'link',
      title: 'Example',
      url: 'https://example.com/article',
    });

    await expect(
      resolveMarkweaveLinkCard({
        href: 'https://example.com/article',
        signal: new AbortController().signal,
        title: '原始标题',
      }),
    ).resolves.toEqual({
      description: '说明',
      imageUrl: 'https://example.com/cover.png',
      siteName: 'example.com',
      title: 'Example',
    });
    expect(resolveLinkPreviewMock).toHaveBeenCalledWith(
      '原始标题',
      'https://example.com/article',
    );
  });

  it('在 Web 端通过 SSRF-safe metadata route 解析', async () => {
    isTauriRuntimeMock.mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        description: '说明',
        domain: 'example.com',
        image: 'https://example.com/cover.png',
        kind: 'link',
        title: 'Example',
        url: 'https://example.com/article',
      }),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await expect(
      resolveMarkweaveLinkCard({
        href: 'https://example.com/article?tab=read',
        signal: controller.signal,
        title: '原始标题',
      }),
    ).resolves.toEqual({
      description: '说明',
      imageUrl: 'https://example.com/cover.png',
      siteName: 'example.com',
      title: 'Example',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/link-preview?title=%E5%8E%9F%E5%A7%8B%E6%A0%87%E9%A2%98&url=https%3A%2F%2Fexample.com%2Farticle%3Ftab%3Dread',
      { signal: controller.signal },
    );
  });

  it('在取消、拒绝或不安全响应时保留普通链接', async () => {
    isTauriRuntimeMock.mockReturnValue(true);
    const controller = new AbortController();
    controller.abort();

    await expect(
      resolveMarkweaveLinkCard({
        href: 'https://example.com/article',
        signal: controller.signal,
        title: '原始标题',
      }),
    ).resolves.toBeNull();
    expect(resolveLinkPreviewMock).not.toHaveBeenCalled();

    isTauriRuntimeMock.mockReturnValue(false);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false }),
    );

    await expect(
      resolveMarkweaveLinkCard({
        href: 'https://example.com/article',
        signal: new AbortController().signal,
        title: '原始标题',
      }),
    ).resolves.toBeNull();
  });

  it('在桌面请求完成前取消时丢弃迟到的元数据', async () => {
    isTauriRuntimeMock.mockReturnValue(true);
    let completePreview: ((value: unknown) => void) | null = null;
    resolveLinkPreviewMock.mockReturnValue(
      new Promise((resolve) => {
        completePreview = resolve;
      }),
    );
    const controller = new AbortController();
    const result = resolveMarkweaveLinkCard({
      href: 'https://example.com/article',
      signal: controller.signal,
      title: '原始标题',
    });

    controller.abort();

    await expect(result).resolves.toBeNull();
    completePreview?.({
      kind: 'link',
      title: '迟到的标题',
      url: 'https://example.com/article',
    });
  });
});
