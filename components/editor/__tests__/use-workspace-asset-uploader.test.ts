import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
}));

vi.mock('@/components/workspace/workspace-api', () => ({
  resolveWorkspaceAsset: vi.fn(),
  uploadWorkspaceAsset: vi.fn(),
}));

import {
  resolveWorkspaceAsset,
  uploadWorkspaceAsset,
} from '@/components/workspace/workspace-api';
import { useWorkspaceAssetUploader } from '@/components/editor/use-workspace-asset-uploader';

describe('useWorkspaceAssetUploader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('上传 File 后返回 Markweave 可显示 URL，并在入库前还原相对路径', async () => {
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
    ).toBe('![图](.madora/assets/files/ab/hash.png)');
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

  it('把正文中的 legacy URL 和新相对路径解析成 Markweave 可显示 URL，并保留原始存储格式', async () => {
    vi.mocked(resolveWorkspaceAsset).mockImplementation(
      async (_rootPath, assetId) => ({
        absolutePath:
          assetId === 'legacy'
            ? '/ws/.madora/assets/files/le/legacy.png'
            : '/ws/.madora/assets/files/aa/new.png',
        id: assetId,
        mediaType: 'image/png',
        name: `${assetId}.png`,
        size: 10,
      }),
    );
    const markdown =
      '![旧](madora-asset://legacy)\n![新](.madora/assets/files/aa/new.png)';

    const { result } = renderHook(() =>
      useWorkspaceAssetUploader('/ws/root', markdown),
    );

    await waitFor(() => {
      expect(result.current.editorMarkdown).toContain(
        'asset:///ws/.madora/assets/files/le/legacy.png',
      );
      expect(result.current.editorMarkdown).toContain(
        'asset:///ws/.madora/assets/files/aa/new.png',
      );
    });

    expect(resolveWorkspaceAsset).toHaveBeenCalledWith('/ws/root', 'legacy');
    expect(resolveWorkspaceAsset).toHaveBeenCalledWith('/ws/root', 'new');
    expect(result.current.toStorageMarkdown(result.current.editorMarkdown)).toBe(
      markdown,
    );
  });

  it('没有工作区根路径时不解析存储引用', () => {
    const markdown = '![旧](madora-asset://legacy)';
    const { result } = renderHook(() =>
      useWorkspaceAssetUploader(null, markdown),
    );

    expect(result.current.editorMarkdown).toBe(markdown);
    expect(resolveWorkspaceAsset).not.toHaveBeenCalled();
  });
});
