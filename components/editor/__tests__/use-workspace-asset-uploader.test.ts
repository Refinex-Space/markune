import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
}));

vi.mock('@/components/workspace/workspace-api', () => ({
  resolveWorkspaceAssets: vi.fn(),
  uploadWorkspaceAsset: vi.fn(),
}));

import {
  resolveWorkspaceAssets,
  uploadWorkspaceAsset,
} from '@/components/workspace/workspace-api';
import { useWorkspaceAssetUploader } from '@/components/editor/use-workspace-asset-uploader';

describe('useWorkspaceAssetUploader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('保留存储引用，通过展示层 resolver 解析媒体，并在保存时规范化旧路径', async () => {
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

    expect(result.current.editorMarkdown).toBeNull();
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
    await waitFor(() => {
      expect(result.current.editorMarkdown).toContain(
        'asset:///ws/.madora/assets/files/le/legacy.png',
      );
    });
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
    expect(result.current.toStorageMarkdown(result.current.editorMarkdown!)).toBe(
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

    await waitFor(() => {
      expect(result.current.editorMarkdown).toContain(
        'asset:///ws/.madora/assets/files/aa/hash.png',
      );
      expect(result.current.editorMarkdown).toContain('3. ');
    });
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
    const renderedMarkdown: Array<string | null> = [];
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
});
