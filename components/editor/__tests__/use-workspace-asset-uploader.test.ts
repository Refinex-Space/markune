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
      absolutePath: '/ws/.madora/assets/files/ab/hash.png',
      id: 'hash',
      mediaType: 'image/png',
      name: 'pic.png',
      relativePath: '.madora/assets/files/ab/hash.png',
      size: 100,
      url: 'madora-asset://hash',
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
      src: 'asset:///ws/.madora/assets/files/ab/hash.png',
    });
    expect(
      result.current.toStorageMarkdown(
        '![图](asset:///ws/.madora/assets/files/ab/hash.png)',
      ),
    ).toBe('![图](madora-asset://hash)');
  });

  it('附件上传返回不透明 madora-asset 定位符并支持进度回调与下载', async () => {
    const onProgress = vi.fn();
    vi.mocked(uploadWorkspaceAsset).mockResolvedValue({
      absolutePath: '/ws/.madora/assets/files/ab/hash.pdf',
      id: 'hash',
      mediaType: 'application/pdf',
      name: 'notes.pdf',
      relativePath: '.madora/assets/files/ab/hash.pdf',
      size: 4,
      url: 'madora-asset://hash',
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
      src: 'madora-asset://hash',
    });
    expect(onProgress).toHaveBeenCalled();
    expect(
      result.current.toStorageMarkdown(
        '<a href="madora-asset://hash" class="markweave-attachment" data-markweave-attachment="true">notes.pdf</a>',
      ),
    ).toContain('madora-asset://hash');

    await act(async () => {
      await result.current.onAttachmentDownload(
        {
          mimeType: 'application/pdf',
          name: 'notes.pdf',
          size: 4,
          src: 'madora-asset://hash',
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
      absolutePath: '/ws/.madora/assets/files/ab/hash.png',
      id: 'hash',
      mediaType: 'image/png',
      name: 'clipboard-image.png',
      relativePath: '.madora/assets/files/ab/hash.png',
      size: 3,
      url: 'madora-asset://hash',
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
      absolutePath: 'C:\\workspace\\.madora\\assets\\files\\ab\\hash.png',
      id: 'hash',
      mediaType: 'image/png',
      name: 'screenshot.png',
      relativePath: '.madora/assets/files/ab/hash.png',
      size: 3,
      url: 'madora-asset://hash',
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
      'asset://C:\\workspace\\.madora\\assets\\files\\ab\\hash.png',
    );
    expect(
      result.current.toStorageMarkdown(`![截图](${uploaded?.src})`),
    ).toBe('![截图](madora-asset://hash)');
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
                ? '/ws/.madora/assets/files/le/legacy.png'
                : '/ws/.madora/assets/files/aa/new.png',
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
      '![旧](madora-asset://legacy)\n![新](.madora/assets/files/aa/new.png)';

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
        src: 'madora-asset://legacy',
      }),
    ).resolves.toMatchObject({
      src: 'asset:///ws/.madora/assets/files/le/legacy.png',
    });
    await expect(
      result.current.resolveMediaSource({
        kind: 'image',
        priority: 'nearby',
        signal,
        src: '.madora/assets/files/aa/new.png',
      }),
    ).resolves.toMatchObject({
      src: 'asset:///ws/.madora/assets/files/aa/new.png',
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
        src: 'asset:///ws/.madora/assets/files/le/legacy.png',
      }),
    ).resolves.toEqual({
      height: 600,
      src: 'asset:///ws/.madora/assets/files/le/legacy.png',
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
      '![旧](madora-asset://legacy)\n![新](madora-asset://new)',
    );
  });

  it('正文更新时复用展示层解析缓存且不重复读取同一资产', async () => {
    vi.mocked(resolveWorkspaceAssets).mockResolvedValue({
      items: [{
        asset: {
          absolutePath: '/ws/.madora/assets/files/aa/hash.png',
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
      '![图](madora-asset://hash)\n\n1. 第一项\n2. 第二项';
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
      src: 'madora-asset://hash',
    };
    await expect(result.current.resolveMediaSource(request)).resolves.toMatchObject({
      src: 'asset:///ws/.madora/assets/files/aa/hash.png',
    });
    expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(1);

    rerender({ markdown: nextMarkdown });

    expect(result.current.editorMarkdown).toBe(nextMarkdown);
    await expect(result.current.resolveMediaSource(request)).resolves.toMatchObject({
      src: 'asset:///ws/.madora/assets/files/aa/hash.png',
    });
    await waitFor(() => {
      expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(1);
    });
  });

  it('旧相对路径解析失败时保留原文，不执行破坏性规范化', async () => {
    vi.mocked(resolveWorkspaceAssets).mockResolvedValueOnce({
      items: [{ id: 'missing', status: 'missing' }],
    });
    const markdown = '![缺失](.madora/assets/files/aa/missing.png)';

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
    const markdown = '![旧](madora-asset://legacy)';
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
      .map((assetId) => `![图](madora-asset://${assetId})`)
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
            absolutePath: '/ws/.madora/assets/files/aa/cached.png',
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
      '![有效](madora-asset://cached)\n![缺失](madora-asset://missing)';
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
        request('madora-asset://cached'),
      ),
    ).resolves.toMatchObject({
      src: 'asset:///ws/.madora/assets/files/aa/cached.png',
    });
    await expect(
      first.result.current.resolveMediaSource(
        request('madora-asset://missing'),
      ),
    ).resolves.toBeNull();
    first.unmount();

    const second = renderHook(() =>
      useWorkspaceAssetUploader('/ws/root', markdown),
    );
    await expect(
      second.result.current.resolveMediaSource(
        request('madora-asset://cached'),
      ),
    ).resolves.toMatchObject({
      src: 'asset:///ws/.madora/assets/files/aa/cached.png',
    });
    await expect(
      second.result.current.resolveMediaSource(
        request('madora-asset://missing'),
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
    const markdown = '![图](madora-asset://pending)';
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
              absolutePath: '/ws/.madora/assets/files/aa/pending.png',
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
        src: 'madora-asset://pending',
      }),
    ).resolves.toMatchObject({
      src: 'asset:///ws/.madora/assets/files/aa/pending.png',
    });
  });

  it('相同资产 ID 在不同工作区使用隔离缓存', async () => {
    vi.mocked(resolveWorkspaceAssets).mockImplementation(
      async (rootPath, assetIds) => ({
        items: assetIds.map((assetId) => ({
          asset: {
            absolutePath: `${rootPath}/.madora/assets/files/aa/${assetId}.png`,
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
    const markdown = '![图](madora-asset://shared)';
    const { result, rerender } = renderHook(
      ({ rootPath }) => useWorkspaceAssetUploader(rootPath, markdown),
      { initialProps: { rootPath: '/ws/one' } },
    );
    const createRequest = () => ({
      kind: 'image' as const,
      priority: 'visible' as const,
      signal: new AbortController().signal,
      src: 'madora-asset://shared',
    });

    await expect(
      result.current.resolveMediaSource(createRequest()),
    ).resolves.toMatchObject({
      src: 'asset:///ws/one/.madora/assets/files/aa/shared.png',
    });

    rerender({ rootPath: '/ws/two' });

    await expect(
      result.current.resolveMediaSource(createRequest()),
    ).resolves.toMatchObject({
      src: 'asset:///ws/two/.madora/assets/files/aa/shared.png',
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
              absolutePath: '/ws/.madora/assets/files/aa/retry.png',
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
        '![图](madora-asset://retry)',
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
        src: 'madora-asset://retry',
      }),
    ).resolves.toMatchObject({
      src: 'asset:///ws/.madora/assets/files/aa/retry.png',
    });
    expect(resolveWorkspaceAssets).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
