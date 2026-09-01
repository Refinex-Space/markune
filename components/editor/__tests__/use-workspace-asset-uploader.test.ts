import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
}));

vi.mock('@/components/workspace/workspace-api', () => ({
  isTauriRuntime: vi.fn(() => true),
  readWorkspaceAssetData: vi.fn(),
  resolveWorkspaceAssets: vi.fn(),
  selectWorkspaceAssetDownloadPath: vi.fn(),
  uploadWorkspaceAsset: vi.fn(),
  writeExportFile: vi.fn(),
}));

import {
  isTauriRuntime,
  readWorkspaceAssetData,
  resolveWorkspaceAssets,
  selectWorkspaceAssetDownloadPath,
  uploadWorkspaceAsset,
  writeExportFile,
} from '@/components/workspace/workspace-api';
import {
  clearWorkspaceAssetResolverCache,
  useWorkspaceAssetUploader,
} from '@/components/editor/use-workspace-asset-uploader';

describe('useWorkspaceAssetUploader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearWorkspaceAssetResolverCache();
    vi.mocked(isTauriRuntime).mockReturnValue(true);
  });

  it('上传 File 后返回 Markweave 可显示 URL，并在入库前还原资产协议引用', async () => {
    vi.mocked(uploadWorkspaceAsset).mockResolvedValue({
      absolutePath: '/ws/.markune/assets/files/ab/hash.png',
      id: 'hash',
      mediaType: 'image/png',
      name: 'pic.png',
      relativePath: '.markune/assets/files/ab/hash.png',
      size: 100,
      url: 'markune-asset://hash',
    });

    const { result } = renderHook(() =>
      useWorkspaceAssetUploader('/ws/root', '# 文档'),
    );
    const file = new File([new Uint8Array([1, 2, 3])], 'pic.png', {
      type: 'image/png',
    });

    let out:
      | Awaited<ReturnType<typeof result.current.onSlashCommandUpload>>
      | undefined;

    await act(async () => {
      out = await result.current.onSlashCommandUpload({
        kind: 'image',
        source: {
          file,
          mimeType: 'image/png',
          type: 'file',
        },
        trigger: 'image-insert',
      });
    });

    expect(uploadWorkspaceAsset).toHaveBeenCalledWith('/ws/root', {
      base64Data: expect.any(String),
      fileName: 'pic.png',
      mediaType: 'image/png',
    });
    expect(out).toEqual({
      mimeType: 'image/png',
      name: 'pic.png',
      size: 100,
      src: 'asset:///ws/.markune/assets/files/ab/hash.png',
    });
    expect(
      result.current.toStorageMarkdown(
        '![图](asset:///ws/.markune/assets/files/ab/hash.png)',
      ),
    ).toBe('![图](markune-asset://hash)');
  });

  it('附件上传返回不透明 markune-asset 定位符并支持进度回调与下载', async () => {
    const onProgress = vi.fn();
    vi.mocked(uploadWorkspaceAsset).mockResolvedValue({
      absolutePath: '/ws/.markune/assets/files/ab/hash.pdf',
      id: 'hash',
      mediaType: 'application/pdf',
      name: 'notes.pdf',
      relativePath: '.markune/assets/files/ab/hash.pdf',
      size: 4,
      url: 'markune-asset://hash',
    });
    vi.mocked(readWorkspaceAssetData).mockResolvedValue({
      base64Data: 'AQIDBA==',
      id: 'hash',
      mediaType: 'application/pdf',
      name: 'notes.pdf',
    });
    vi.mocked(selectWorkspaceAssetDownloadPath).mockResolvedValue(
      '/tmp/notes.pdf',
    );

    const { result } = renderHook(() =>
      useWorkspaceAssetUploader('/ws/root', '# 文档'),
    );
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'notes.pdf', {
      type: 'application/pdf',
    });

    let out:
      | Awaited<ReturnType<typeof result.current.onSlashCommandUpload>>
      | undefined;

    await act(async () => {
      out = await result.current.onSlashCommandUpload({
        kind: 'attachment',
        onProgress,
        source: {
          file,
          mimeType: 'application/pdf',
          type: 'file',
        },
        trigger: 'attachment-insert',
      });
    });

    expect(out).toEqual({
      mimeType: 'application/pdf',
      name: 'notes.pdf',
      size: 4,
      src: 'markune-asset://hash',
    });
    expect(onProgress).toHaveBeenCalled();
    expect(
      result.current.toStorageMarkdown(
        '<a href="markune-asset://hash" class="markweave-attachment" data-markweave-attachment="true">notes.pdf</a>',
      ),
    ).toContain('markune-asset://hash');

    await act(async () => {
      await result.current.onAttachmentDownload(
        {
          mimeType: 'application/pdf',
          name: 'notes.pdf',
          size: 4,
          src: 'markune-asset://hash',
        },
        {
          event: new MouseEvent('click'),
          mode: 'live',
        },
      );
    });

    expect(readWorkspaceAssetData).toHaveBeenCalledWith('/ws/root', 'hash');
    expect(selectWorkspaceAssetDownloadPath).toHaveBeenCalledWith(
      'notes.pdf',
      'application/pdf',
    );
    expect(writeExportFile).toHaveBeenCalledWith('/tmp/notes.pdf', 'AQIDBA==');
  });

  it('rootPath 为 null 时文件上传抛错', async () => {
    const { result } = renderHook(() =>
      useWorkspaceAssetUploader(null, '# 文档'),
    );

    await act(async () => {
      await expect(
        result.current.onSlashCommandUpload({
          kind: 'image',
          source: {
            file: new File([], 'x.png'),
            type: 'file',
          },
          trigger: 'image-insert',
        }),
      ).rejects.toThrow('未打开工作区');
    });
  });

  it('为空文件名的剪贴板截图生成安全文件名', async () => {
    vi.mocked(uploadWorkspaceAsset).mockResolvedValue({
      absolutePath: '/ws/.markune/assets/files/ab/hash.png',
      id: 'hash',
      mediaType: 'image/png',
      name: 'clipboard-image.png',
      relativePath: '.markune/assets/files/ab/hash.png',
      size: 3,
      url: 'markune-asset://hash',
    });
    const { result } = renderHook(() =>
      useWorkspaceAssetUploader('/ws/root', '# 文档'),
    );

    await act(async () => {
      await result.current.onSlashCommandUpload({
        kind: 'image',
        source: {
          file: new File([new Uint8Array([1, 2, 3])], '', {
            type: 'image/png',
          }),
          mimeType: 'image/png',
          type: 'file',
        },
        trigger: 'image-insert',
      });
    });

    expect(uploadWorkspaceAsset).toHaveBeenCalledWith('/ws/root', {
      base64Data: expect.any(String),
      fileName: 'clipboard-image.png',
      mediaType: 'image/png',
    });
  });

  it('Windows 展示路径在保存时还原为与系统路径无关的资产协议引用', async () => {
    vi.mocked(uploadWorkspaceAsset).mockResolvedValue({
      absolutePath: 'C:\\workspace\\.markune\\assets\\files\\ab\\hash.png',
      id: 'hash',
      mediaType: 'image/png',
      name: 'screenshot.png',
      relativePath: '.markune/assets/files/ab/hash.png',
      size: 3,
      url: 'markune-asset://hash',
    });
    const { result } = renderHook(() =>
      useWorkspaceAssetUploader('C:\\workspace', '# 文档'),
    );
    let uploaded:
      | Awaited<ReturnType<typeof result.current.onSlashCommandUpload>>
      | undefined;

    await act(async () => {
      uploaded = await result.current.onSlashCommandUpload({
        kind: 'image',
        source: {
          file: new File([new Uint8Array([1, 2, 3])], 'screenshot.png', {
            type: 'image/png',
          }),
          mimeType: 'image/png',
          type: 'file',
        },
        trigger: 'image-insert',
      });
    });

    expect(uploaded?.src).toBe(
      'asset://C:\\workspace\\.markune\\assets\\files\\ab\\hash.png',
    );
    expect(
      result.current.toStorageMarkdown(`![截图](${uploaded?.src})`),
    ).toBe('![截图](markune-asset://hash)');
  });

  it('直接 URL、base64 或用户输入相对路径按 Markweave 协议透传', async () => {
    const { result } = renderHook(() =>
      useWorkspaceAssetUploader('/ws/root', '# 文档'),
    );

    const out = await result.current.onSlashCommandUpload({
      kind: 'video',
      source: {
        mimeType: 'video/mp4',
        type: 'url',
        value: 'https://example.com/a.mp4',
      },
      trigger: 'video-insert',
    });

    expect(uploadWorkspaceAsset).not.toHaveBeenCalled();
    expect(out).toEqual({
      mimeType: 'video/mp4',
      name: 'a.mp4',
      src: 'https://example.com/a.mp4',
    });
    expect(result.current.toStorageMarkdown('https://example.com/a.mp4')).toBe(
      'https://example.com/a.mp4',
    );
  });

  it('首帧立即返回存储 Markdown，并通过展示层 resolver 单批解析全部媒体', async () => {
    vi.mocked(resolveWorkspaceAssets).mockImplementation(
      async (_rootPath, assetIds) => ({
        items: assetIds.map((assetId) => ({
          asset: {
            absolutePath:
              assetId === 'legacy'
                ? '/ws/.markune/assets/files/le/legacy.png'
                : '/ws/.markune/assets/files/aa/new.png',
            id: assetId,
            height: 600,
            mediaType: 'image/png',
            name: `${assetId}.png`,
            size: 10,
            width: 800,
          },
          id: assetId,
          status: 'resolved' as const,
        })),
      }),
    );
    const markdown =
      '![旧](markune-asset://legacy)\n![新](.markune/assets/files/aa/new.png)';

    const { result } = renderHook(() =>
      useWorkspaceAssetUploader('/ws/root', markdown),
    );

    expect(result.current.editorMarkdown).toBe(markdown);
    const signal = new AbortController().signal;
    await expect(
      result.current.resolveMediaSource({
        kind: 'image',
        priority: 'visible',
        signal,
        src: 'markune-asset://legacy',
      }),
    ).resolves.toMatchObject({
      src: 'asset:///ws/.markune/assets/files/le/legacy.png',
    });
    await expect(
      result.current.resolveMediaSource({
        kind: 'image',
        priority: 'nearby',
        signal,
        src: '.markune/assets/files/aa/new.png',
      }),
    ).resolves.toMatchObject({
      src: 'asset:///ws/.markune/assets/files/aa/new.png',
    });

    expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(1);
    expect(resolveWorkspaceAssets).toHaveBeenCalledWith(
      '/ws/root',
      expect.arrayContaining(['legacy', 'new']),
    );
    expect(result.current.editorMarkdown).toBe(markdown);
    await expect(
      result.current.resolveMediaSource({
        kind: 'image',
        priority: 'visible',
        signal,
        src: 'asset:///ws/.markune/assets/files/le/legacy.png',
      }),
    ).resolves.toEqual({
      height: 600,
      src: 'asset:///ws/.markune/assets/files/le/legacy.png',
      width: 800,
    });
    await expect(
      result.current.resolveMediaSource({
        kind: 'image',
        priority: 'visible',
        signal,
        src: 'https://example.com/remote.png',
      }),
    ).resolves.toEqual({ src: 'https://example.com/remote.png' });
    expect(result.current.toStorageMarkdown(result.current.editorMarkdown)).toBe(
      '![旧](markune-asset://legacy)\n![新](markune-asset://new)',
    );
  });

  it('正文更新时复用展示层解析缓存且不重复读取同一资产', async () => {
    vi.mocked(resolveWorkspaceAssets).mockResolvedValue({
      items: [{
        asset: {
          absolutePath: '/ws/.markune/assets/files/aa/hash.png',
          id: 'hash',
          mediaType: 'image/png',
          name: 'hash.png',
          size: 10,
        },
        id: 'hash',
        status: 'resolved',
      }],
    });
    const initialMarkdown =
      '![图](markune-asset://hash)\n\n1. 第一项\n2. 第二项';
    const nextMarkdown = `${initialMarkdown}\n3. `;
    const { result, rerender } = renderHook(
      ({ markdown }) => useWorkspaceAssetUploader('/ws/root', markdown),
      {
        initialProps: { markdown: initialMarkdown },
      },
    );

    const request = {
      kind: 'image' as const,
      priority: 'visible' as const,
      signal: new AbortController().signal,
      src: 'markune-asset://hash',
    };
    await expect(result.current.resolveMediaSource(request)).resolves.toMatchObject({
      src: 'asset:///ws/.markune/assets/files/aa/hash.png',
    });
    expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(1);

    rerender({ markdown: nextMarkdown });

    expect(result.current.editorMarkdown).toBe(nextMarkdown);
    await expect(result.current.resolveMediaSource(request)).resolves.toMatchObject({
      src: 'asset:///ws/.markune/assets/files/aa/hash.png',
    });
    await waitFor(() => {
      expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(1);
    });
  });

  it('旧相对路径解析失败时保留原文，不执行破坏性规范化', async () => {
    vi.mocked(resolveWorkspaceAssets).mockResolvedValueOnce({
      items: [{ id: 'missing', status: 'missing' }],
    });
    const markdown = '![缺失](.markune/assets/files/aa/missing.png)';

    const { result } = renderHook(() =>
      useWorkspaceAssetUploader('/ws/root', markdown),
    );

    await waitFor(() => {
      expect(resolveWorkspaceAssets).toHaveBeenCalledWith('/ws/root', [
        'missing',
      ]);
    });

    await waitFor(() => {
      expect(result.current.editorMarkdown).toBe(markdown);
    });
    expect(result.current.toStorageMarkdown(markdown)).toBe(markdown);
  });

  it('没有工作区根路径时不解析存储引用', () => {
    const markdown = '![旧](markune-asset://legacy)';
    const { result } = renderHook(() =>
      useWorkspaceAssetUploader(null, markdown),
    );

    expect(result.current.editorMarkdown).toBe(markdown);
    expect(resolveWorkspaceAssets).not.toHaveBeenCalled();
  });

  it('切换文档时首帧立即返回新文档内容', () => {
    const renderedMarkdown: string[] = [];
    const { rerender } = renderHook(
      ({ markdown }) => {
        const bridge = useWorkspaceAssetUploader('/ws/root', markdown);

        renderedMarkdown.push(bridge.editorMarkdown);
        return bridge;
      },
      {
        initialProps: { markdown: '# 旧文档' },
      },
    );

    renderedMarkdown.length = 0;
    rerender({ markdown: '# 新文档' });

    expect(renderedMarkdown[0]).toBe('# 新文档');
  });

  it('资源批量解析未完成时也立即返回正文', () => {
    vi.mocked(resolveWorkspaceAssets).mockImplementation(
      () => new Promise(() => {}),
    );
    const assetIds = Array.from(
      { length: 421 },
      (_, index) => `slow-${index}`,
    );
    const markdown = assetIds
      .map((assetId) => `![图](markune-asset://${assetId})`)
      .join('\n');
    const { result } = renderHook(() =>
      useWorkspaceAssetUploader('/ws/root', markdown),
    );

    expect(result.current.editorMarkdown).toBe(markdown);
    expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(1);
    expect(resolveWorkspaceAssets).toHaveBeenCalledWith(
      '/ws/root',
      assetIds,
    );
  });

  it('卸载后再次挂载同一文档时复用成功和缺失资源缓存', async () => {
    vi.mocked(resolveWorkspaceAssets).mockResolvedValue({
      items: [
        {
          asset: {
            absolutePath: '/ws/.markune/assets/files/aa/cached.png',
            id: 'cached',
            mediaType: 'image/png',
            name: 'cached.png',
            size: 10,
          },
          id: 'cached',
          status: 'resolved',
        },
        { id: 'missing', status: 'missing' },
      ],
    });
    const markdown =
      '![有效](markune-asset://cached)\n![缺失](markune-asset://missing)';
    const request = (src: string) => ({
      kind: 'image' as const,
      priority: 'visible' as const,
      signal: new AbortController().signal,
      src,
    });
    const first = renderHook(() =>
      useWorkspaceAssetUploader('/ws/root', markdown),
    );

    await expect(
      first.result.current.resolveMediaSource(
        request('markune-asset://cached'),
      ),
    ).resolves.toMatchObject({
      src: 'asset:///ws/.markune/assets/files/aa/cached.png',
    });
    await expect(
      first.result.current.resolveMediaSource(
        request('markune-asset://missing'),
      ),
    ).resolves.toBeNull();
    first.unmount();

    const second = renderHook(() =>
      useWorkspaceAssetUploader('/ws/root', markdown),
    );
    await expect(
      second.result.current.resolveMediaSource(
        request('markune-asset://cached'),
      ),
    ).resolves.toMatchObject({
      src: 'asset:///ws/.markune/assets/files/aa/cached.png',
    });
    await expect(
      second.result.current.resolveMediaSource(
        request('markune-asset://missing'),
      ),
    ).resolves.toBeNull();

    expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(1);
  });

  it('资源仍在解析时快速卸载并重挂载只复用同一个批量请求', async () => {
    let finishResolution:
      | ((value: {
          items: Array<{
            asset: {
              absolutePath: string;
              id: string;
              mediaType: string;
              name: string;
              size: number;
            };
            id: string;
            status: 'resolved';
          }>;
        }) => void)
      | undefined;
    vi.mocked(resolveWorkspaceAssets).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishResolution = resolve;
        }),
    );
    const markdown = '![图](markune-asset://pending)';
    const first = renderHook(() =>
      useWorkspaceAssetUploader('/ws/root', markdown),
    );
    first.unmount();
    const second = renderHook(() =>
      useWorkspaceAssetUploader('/ws/root', markdown),
    );

    expect(second.result.current.editorMarkdown).toBe(markdown);
    expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishResolution?.({
        items: [
          {
            asset: {
              absolutePath: '/ws/.markune/assets/files/aa/pending.png',
              id: 'pending',
              mediaType: 'image/png',
              name: 'pending.png',
              size: 10,
            },
            id: 'pending',
            status: 'resolved',
          },
        ],
      });
    });

    await expect(
      second.result.current.resolveMediaSource({
        kind: 'image',
        priority: 'visible',
        signal: new AbortController().signal,
        src: 'markune-asset://pending',
      }),
    ).resolves.toMatchObject({
      src: 'asset:///ws/.markune/assets/files/aa/pending.png',
    });
  });

  it('相同资产 ID 在不同工作区使用隔离缓存', async () => {
    vi.mocked(resolveWorkspaceAssets).mockImplementation(
      async (rootPath, assetIds) => ({
        items: assetIds.map((assetId) => ({
          asset: {
            absolutePath: `${rootPath}/.markune/assets/files/aa/${assetId}.png`,
            id: assetId,
            mediaType: 'image/png',
            name: `${assetId}.png`,
            size: 10,
          },
          id: assetId,
          status: 'resolved' as const,
        })),
      }),
    );
    const markdown = '![图](markune-asset://shared)';
    const { result, rerender } = renderHook(
      ({ rootPath }) => useWorkspaceAssetUploader(rootPath, markdown),
      { initialProps: { rootPath: '/ws/one' } },
    );
    const createRequest = () => ({
      kind: 'image' as const,
      priority: 'visible' as const,
      signal: new AbortController().signal,
      src: 'markune-asset://shared',
    });

    await expect(
      result.current.resolveMediaSource(createRequest()),
    ).resolves.toMatchObject({
      src: 'asset:///ws/one/.markune/assets/files/aa/shared.png',
    });

    rerender({ rootPath: '/ws/two' });

    await expect(
      result.current.resolveMediaSource(createRequest()),
    ).resolves.toMatchObject({
      src: 'asset:///ws/two/.markune/assets/files/aa/shared.png',
    });
    expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(2);
  });

  it('批量解析失败后允许媒体 resolver 重试', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(resolveWorkspaceAssets)
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({
        items: [
          {
            asset: {
              absolutePath: '/ws/.markune/assets/files/aa/retry.png',
              id: 'retry',
              mediaType: 'image/png',
              name: 'retry.png',
              size: 10,
            },
            id: 'retry',
            status: 'resolved',
          },
        ],
      });
    const { result } = renderHook(() =>
      useWorkspaceAssetUploader(
        '/ws/root',
        '![图](markune-asset://retry)',
      ),
    );

    await waitFor(() => {
      expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalled();
    });

    await expect(
      result.current.resolveMediaSource({
        kind: 'image',
        priority: 'visible',
        signal: new AbortController().signal,
        src: 'markune-asset://retry',
      }),
    ).resolves.toMatchObject({
      src: 'asset:///ws/.markune/assets/files/aa/retry.png',
    });
    expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('missing 与 unreadable 负缓存过期后自动重新解析', async () => {
    let now = 1_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.mocked(resolveWorkspaceAssets)
      .mockResolvedValueOnce({
        items: [
          { id: 'missing', status: 'missing' },
          { id: 'unreadable', status: 'unreadable' },
        ],
      })
      .mockImplementation(async (_rootPath, assetIds) => ({
        items: assetIds.map((assetId) => ({
          asset: {
            absolutePath: `/ws/.markune/assets/files/aa/${assetId}.png`,
            id: assetId,
            mediaType: 'image/png',
            name: `${assetId}.png`,
            size: 10,
          },
          id: assetId,
          status: 'resolved' as const,
        })),
      }));
    const markdown = [
      '![缺失](markune-asset://missing)',
      '![不可读](markune-asset://unreadable)',
    ].join('\n');
    const { result } = renderHook(() =>
      useWorkspaceAssetUploader('/ws/root', markdown),
    );
    const request = (src: string) => ({
      kind: 'image' as const,
      priority: 'visible' as const,
      signal: new AbortController().signal,
      src,
    });

    await waitFor(() => {
      expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(1);
    });
    await expect(
      result.current.resolveMediaSource(request('markune-asset://missing')),
    ).resolves.toBeNull();
    await expect(
      result.current.resolveMediaSource(request('markune-asset://unreadable')),
    ).resolves.toBeNull();
    expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(1);

    now = 7_000;
    await expect(
      result.current.resolveMediaSource(request('markune-asset://missing')),
    ).resolves.toMatchObject({
      src: 'asset:///ws/.markune/assets/files/aa/missing.png',
    });
    await expect(
      result.current.resolveMediaSource(request('markune-asset://unreadable')),
    ).resolves.toMatchObject({
      src: 'asset:///ws/.markune/assets/files/aa/unreadable.png',
    });
    expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });

  it.each(['retry', 'image-error', 'output'] as const)(
    '%s 恢复请求强制刷新已缓存的 resolver 候选',
    async (reason) => {
      vi.mocked(resolveWorkspaceAssets)
        .mockResolvedValueOnce({
          items: [
            {
              asset: {
                absolutePath: '/ws/.markune/assets/files/aa/old.png',
                id: 'recover',
                mediaType: 'image/png',
                name: 'old.png',
                size: 10,
              },
              id: 'recover',
              status: 'resolved',
            },
          ],
        })
        .mockResolvedValueOnce({
          items: [
            {
              asset: {
                absolutePath: '/ws/.markune/assets/files/aa/new.png',
                id: 'recover',
                mediaType: 'image/png',
                name: 'new.png',
                size: 10,
              },
              id: 'recover',
              status: 'resolved',
            },
          ],
        });
      const { result } = renderHook(() =>
        useWorkspaceAssetUploader(
          '/ws/root',
          '![图](markune-asset://recover)',
        ),
      );
      const baseRequest = {
        kind: 'image' as const,
        priority: 'visible' as const,
        signal: new AbortController().signal,
        src: 'markune-asset://recover',
      };

      await expect(
        result.current.resolveMediaSource(baseRequest),
      ).resolves.toMatchObject({
        src: 'asset:///ws/.markune/assets/files/aa/old.png',
      });
      await expect(
        result.current.resolveMediaSource({
          ...baseRequest,
          reason,
        }),
      ).resolves.toMatchObject({
        src: 'asset:///ws/.markune/assets/files/aa/new.png',
      });
      expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(2);
    },
  );

  it('attempt 大于一时绕过负缓存，并合并同一文档的并发恢复波', async () => {
    let finishRecovery:
      | ((value: {
          items: Array<{
            asset: {
              absolutePath: string;
              id: string;
              mediaType: string;
              name: string;
              size: number;
            };
            id: string;
            status: 'resolved';
          }>;
        }) => void)
      | undefined;
    vi.mocked(resolveWorkspaceAssets)
      .mockResolvedValueOnce({
        items: [{ id: 'recover', status: 'missing' }],
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRecovery = resolve;
          }),
      );
    const { result } = renderHook(() =>
      useWorkspaceAssetUploader(
        '/ws/root',
        '![图](markune-asset://recover)',
      ),
    );

    await waitFor(() => {
      expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(1);
    });
    const createRequest = () => ({
      attempt: 2,
      kind: 'image' as const,
      priority: 'visible' as const,
      reason: 'viewport' as const,
      signal: new AbortController().signal,
      src: 'markune-asset://recover',
    });
    const first = result.current.resolveMediaSource(createRequest());
    const second = result.current.resolveMediaSource(createRequest());

    expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(2);
    await act(async () => {
      finishRecovery?.({
        items: [
          {
            asset: {
              absolutePath: '/ws/.markune/assets/files/aa/recovered.png',
              id: 'recover',
              mediaType: 'image/png',
              name: 'recovered.png',
              size: 10,
            },
            id: 'recover',
            status: 'resolved',
          },
        ],
      });
    });

    await expect(first).resolves.toMatchObject({
      src: 'asset:///ws/.markune/assets/files/aa/recovered.png',
    });
    await expect(second).resolves.toMatchObject({
      src: 'asset:///ws/.markune/assets/files/aa/recovered.png',
    });
    expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(2);
  });

  it('超过原生与宿主缓存上限的唯一资产 ID 按 2048 分片且完整合并', async () => {
    vi.mocked(resolveWorkspaceAssets).mockImplementation(
      async (_rootPath, assetIds) => ({
        items: assetIds.map((assetId) => ({
          asset: {
            absolutePath: `/ws/.markune/assets/files/aa/${assetId}.png`,
            id: assetId,
            mediaType: 'image/png',
            name: `${assetId}.png`,
            size: 10,
          },
          id: assetId,
          status: 'resolved' as const,
        })),
      }),
    );
    const assetIds = Array.from(
      { length: 8_193 },
      (_, index) => `asset-${index}`,
    );
    const markdown = assetIds
      .map((assetId) => `![图](markune-asset://${assetId})`)
      .join('\n');
    const { result } = renderHook(() =>
      useWorkspaceAssetUploader('/ws/root', markdown),
    );

    expect(result.current.editorMarkdown).toBe(markdown);
    const firstAssetResolution = result.current.resolveMediaSource({
      kind: 'video',
      priority: 'visible',
      signal: new AbortController().signal,
      src: 'markune-asset://asset-0',
    });
    await expect(firstAssetResolution).resolves.toMatchObject({
      src: 'asset:///ws/.markune/assets/files/aa/asset-0.png',
    });
    await waitFor(() => {
      expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(5);
    });
    const batches = vi.mocked(resolveWorkspaceAssets).mock.calls.map(
      ([, requestedAssetIds]) => requestedAssetIds,
    );
    expect(batches.every((batch) => batch.length <= 2_048)).toBe(true);
    expect(batches.flat()).toEqual(assetIds);
  });

  it('单个分片失败不会覆盖其他分片，并只重试失败的资产集合', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let firstChunkFailed = false;
    vi.mocked(resolveWorkspaceAssets).mockImplementation(
      async (_rootPath, assetIds) => {
        if (!firstChunkFailed && assetIds[0] === 'asset-0') {
          firstChunkFailed = true;
          throw new Error('temporary chunk failure');
        }

        return {
          items: assetIds.map((assetId) => ({
            asset: {
              absolutePath: `/ws/.markune/assets/files/aa/${assetId}.png`,
              id: assetId,
              mediaType: 'image/png',
              name: `${assetId}.png`,
              size: 10,
            },
            id: assetId,
            status: 'resolved' as const,
          })),
        };
      },
    );
    const assetIds = Array.from(
      { length: 2_049 },
      (_, index) => `asset-${index}`,
    );
    const markdown = assetIds
      .map((assetId) => `![图](markune-asset://${assetId})`)
      .join('\n');
    const { result } = renderHook(() =>
      useWorkspaceAssetUploader('/ws/root', markdown),
    );
    const request = (assetId: string) => ({
      kind: 'image' as const,
      priority: 'visible' as const,
      signal: new AbortController().signal,
      src: `markune-asset://${assetId}`,
    });

    await waitFor(() => {
      expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalled();
    });
    await expect(
      result.current.resolveMediaSource(request('asset-2048')),
    ).resolves.toMatchObject({
      src: 'asset:///ws/.markune/assets/files/aa/asset-2048.png',
    });
    expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(2);

    await expect(
      result.current.resolveMediaSource(request('asset-0')),
    ).resolves.toMatchObject({
      src: 'asset:///ws/.markune/assets/files/aa/asset-0.png',
    });
    expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(3);
    expect(resolveWorkspaceAssets).toHaveBeenLastCalledWith(
      '/ws/root',
      assetIds.slice(0, 2_048),
    );
    warn.mockRestore();
  });

  it('取消中的媒体请求立即返回 null，后台共享解析仍可完成', async () => {
    let finishResolution:
      | ((value: {
          items: Array<{
            asset: {
              absolutePath: string;
              id: string;
              mediaType: string;
              name: string;
              size: number;
            };
            id: string;
            status: 'resolved';
          }>;
        }) => void)
      | undefined;
    vi.mocked(resolveWorkspaceAssets).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishResolution = resolve;
        }),
    );
    const { result } = renderHook(() =>
      useWorkspaceAssetUploader(
        '/ws/root',
        '![图](markune-asset://pending)',
      ),
    );
    const controller = new AbortController();
    const resolution = result.current.resolveMediaSource({
      kind: 'image',
      priority: 'visible',
      signal: controller.signal,
      src: 'markune-asset://pending',
    });

    controller.abort();
    await expect(resolution).resolves.toBeNull();

    await act(async () => {
      finishResolution?.({
        items: [
          {
            asset: {
              absolutePath: '/ws/.markune/assets/files/aa/pending.png',
              id: 'pending',
              mediaType: 'image/png',
              name: 'pending.png',
              size: 10,
            },
            id: 'pending',
            status: 'resolved',
          },
        ],
      });
    });
    await expect(
      result.current.resolveMediaSource({
        kind: 'image',
        priority: 'visible',
        signal: new AbortController().signal,
        src: 'markune-asset://pending',
      }),
    ).resolves.toMatchObject({
      src: 'asset:///ws/.markune/assets/files/aa/pending.png',
    });
    expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(1);
  });

  it('工作区切换后忽略旧 resolver generation 的晚到结果', async () => {
    const finishByRoot = new Map<
      string,
      (value: {
        items: Array<{
          asset: {
            absolutePath: string;
            id: string;
            mediaType: string;
            name: string;
            size: number;
          };
          id: string;
          status: 'resolved';
        }>;
      }) => void
    >();
    vi.mocked(resolveWorkspaceAssets).mockImplementation(
      (rootPath) =>
        new Promise((resolve) => {
          finishByRoot.set(rootPath, resolve);
        }),
    );
    const markdown = '![图](markune-asset://shared)';
    const { result, rerender } = renderHook(
      ({ rootPath }) => useWorkspaceAssetUploader(rootPath, markdown),
      { initialProps: { rootPath: '/ws/one' } },
    );
    const oldResolver = result.current.resolveMediaSource;
    const oldResolution = oldResolver({
      kind: 'image',
      priority: 'visible',
      signal: new AbortController().signal,
      src: 'markune-asset://shared',
    });

    rerender({ rootPath: '/ws/two' });
    await act(async () => {
      finishByRoot.get('/ws/one')?.({
        items: [
          {
            asset: {
              absolutePath: '/ws/one/.markune/assets/files/aa/shared.png',
              id: 'shared',
              mediaType: 'image/png',
              name: 'shared.png',
              size: 10,
            },
            id: 'shared',
            status: 'resolved',
          },
        ],
      });
    });
    await expect(oldResolution).resolves.toBeNull();

    await act(async () => {
      finishByRoot.get('/ws/two')?.({
        items: [
          {
            asset: {
              absolutePath: '/ws/two/.markune/assets/files/aa/shared.png',
              id: 'shared',
              mediaType: 'image/png',
              name: 'shared.png',
              size: 10,
            },
            id: 'shared',
            status: 'resolved',
          },
        ],
      });
    });
    await expect(
      result.current.resolveMediaSource({
        kind: 'image',
        priority: 'visible',
        signal: new AbortController().signal,
        src: 'markune-asset://shared',
      }),
    ).resolves.toMatchObject({
      src: 'asset:///ws/two/.markune/assets/files/aa/shared.png',
    });
  });
});
