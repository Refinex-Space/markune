import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readWorkspaceAssetData } from '../workspace-api';
import {
  LOCAL_ASSET_RELATIVE_PREFIX,
  LOCAL_ASSET_URL_PREFIX,
  extractWorkspaceAssetReferences,
  getWorkspaceAssetIdFromReference,
  isLocalAssetUrl,
  isWorkspaceAssetReference,
  isWorkspaceAssetRelativePath,
  localAssetUrlToImageDataUrl,
} from '../workspace-local-assets';

vi.mock('../workspace-api', () => ({
  readWorkspaceAssetData: vi.fn(),
}));

const readWorkspaceAssetDataMock = vi.mocked(readWorkspaceAssetData);

describe('workspace-local-assets', () => {
  beforeEach(() => {
    readWorkspaceAssetDataMock.mockReset();
  });

  describe('isLocalAssetUrl', () => {
    it('只把 madora-asset:// 识别为正式资产 URL', () => {
      expect(isLocalAssetUrl('madora-asset://abc')).toBe(true);
      expect(isLocalAssetUrl('.madora/assets/files/ab/hash.png')).toBe(false);
      expect(isLocalAssetUrl('refinex-asset://abc')).toBe(false);
      expect(isLocalAssetUrl('https://example.com/a.png')).toBe(false);
      expect(isLocalAssetUrl(null)).toBe(false);
      expect(isLocalAssetUrl(undefined)).toBe(false);
    });

    it('使用 LOCAL_ASSET_URL_PREFIX 常量', () => {
      expect(LOCAL_ASSET_URL_PREFIX).toBe('madora-asset://');
    });
  });

  describe('workspace asset relative path', () => {
    it('识别正式协议引用和兼容的工作区根相对路径', () => {
      expect(LOCAL_ASSET_RELATIVE_PREFIX).toBe('.madora/assets/files/');
      expect(isWorkspaceAssetRelativePath('.madora/assets/files/ab/hash.png'))
        .toBe(true);
      expect(isWorkspaceAssetRelativePath('notes/.madora/assets/files/ab/hash.png'))
        .toBe(false);
      expect(isWorkspaceAssetReference('madora-asset://abc')).toBe(true);
      expect(isWorkspaceAssetReference('.madora/assets/files/ab/hash.png')).toBe(
        true,
      );
      expect(isWorkspaceAssetReference('https://example.com/a.png')).toBe(false);
    });

    it('从正式协议 URL 和兼容相对路径提取资产 id', () => {
      expect(getWorkspaceAssetIdFromReference('madora-asset://abc-1')).toBe(
        'abc-1',
      );
      expect(
        getWorkspaceAssetIdFromReference('.madora/assets/files/ab/hash.png'),
      ).toBe('hash');
      expect(
        getWorkspaceAssetIdFromReference(
          '.madora/assets/files/ab/hash.png?x=1',
        ),
      ).toBe('hash');
      expect(getWorkspaceAssetIdFromReference('refinex-asset://abc')).toBeNull();
    });

    it('提取 Markdown 中出现的两种本地资源引用', () => {
      expect(
        extractWorkspaceAssetReferences(
          '![旧](madora-asset://legacy)\n<video src=".madora/assets/files/ab/hash.mp4"></video>',
        ),
      ).toEqual([
        'madora-asset://legacy',
        '.madora/assets/files/ab/hash.mp4',
      ]);
    });
  });

  describe('localAssetUrlToImageDataUrl', () => {
    it('把图片资源转成 data URL', async () => {
      readWorkspaceAssetDataMock.mockResolvedValueOnce({
        id: 'asset-a',
        name: 'cover.png',
        mediaType: 'image/png',
        base64Data: 'cG5n',
      });

      await expect(
        localAssetUrlToImageDataUrl('madora-asset://asset-a', '/repo'),
      ).resolves.toBe('data:image/png;base64,cG5n');
      expect(readWorkspaceAssetDataMock).toHaveBeenCalledWith('/repo', 'asset-a');
    });

    it('把兼容相对路径图片资源转成 data URL', async () => {
      readWorkspaceAssetDataMock.mockResolvedValueOnce({
        id: 'asset-a',
        name: 'cover.png',
        mediaType: 'image/png',
        base64Data: 'cG5n',
      });

      await expect(
        localAssetUrlToImageDataUrl(
          '.madora/assets/files/ab/asset-a.png',
          '/repo',
        ),
      ).resolves.toBe('data:image/png;base64,cG5n');
      expect(readWorkspaceAssetDataMock).toHaveBeenCalledWith('/repo', 'asset-a');
    });

    it('旧 refinex-asset:// 图片资源返回 null', async () => {
      await expect(
        localAssetUrlToImageDataUrl('refinex-asset://asset-a', '/repo'),
      ).resolves.toBeNull();
      expect(readWorkspaceAssetDataMock).not.toHaveBeenCalled();
    });

    it('非图片资源返回 null', async () => {
      readWorkspaceAssetDataMock.mockResolvedValueOnce({
        id: 'asset-a',
        name: 'voice.mp3',
        mediaType: 'audio/mpeg',
        base64Data: 'YXVkaW8=',
      });

      await expect(
        localAssetUrlToImageDataUrl('madora-asset://asset-a', '/repo'),
      ).resolves.toBeNull();
    });

    it('无效 asset id 返回 null', async () => {
      await expect(
        localAssetUrlToImageDataUrl('madora-asset://', '/repo'),
      ).resolves.toBeNull();
    });
  });
});
