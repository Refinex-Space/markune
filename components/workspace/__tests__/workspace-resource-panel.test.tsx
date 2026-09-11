import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceResourcePanel } from '../workspace-resource-panel';
import {
  openPathInFileManager,
  openUrlInDefaultBrowser,
  readDocumentAssetData,
  readWorkspaceAssetData,
  resolveDocumentAssets,
  resolveWorkspaceAsset,
  selectWorkspaceAssetDownloadPath,
  writeExportFile,
} from '../workspace-api';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `https://asset.localhost${path}`,
}));
vi.mock('../workspace-api', () => ({
  isTauriRuntime: () => true,
  openPathInFileManager: vi.fn(),
  openUrlInDefaultBrowser: vi.fn(),
  readDocumentAssetData: vi.fn(),
  readWorkspaceAssetData: vi.fn(),
  resolveDocumentAssets: vi.fn(),
  resolveWorkspaceAsset: vi.fn(),
  selectWorkspaceAssetDownloadPath: vi.fn(),
  writeExportFile: vi.fn(),
}));

const asset = {
  id: 'diagram',
  name: '架构图.png',
  mediaType: 'image/png',
  size: 2048,
  absolutePath: '/vault/.markune/assets/files/diagram.png',
};
const data = {
  id: 'diagram',
  name: '架构图.png',
  mediaType: 'image/png',
  base64Data: 'aW1hZ2U=',
};
const documents = [
  {
    title: '技术实践',
    relativePath: 'notes/practice.md',
    resources: ['markune-asset://diagram'],
    links: [],
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveWorkspaceAsset).mockResolvedValue(asset);
  vi.mocked(readWorkspaceAssetData).mockResolvedValue(data);
  vi.mocked(selectWorkspaceAssetDownloadPath).mockResolvedValue(
    '/downloads/架构图.png',
  );
  vi.mocked(writeExportFile).mockResolvedValue('/downloads/架构图.png');
});
afterEach(cleanup);

describe('resource panel', () => {
  it('switches images with arrow keys and keeps a clear failure state in the preview', async () => {
    vi.mocked(resolveWorkspaceAsset).mockImplementation(async (_root, id) => ({
      ...asset,
      id,
      name: `${id}.png`,
      absolutePath: `/vault/${id}.png`,
    }));
    const user = userEvent.setup();
    render(
      <WorkspaceResourcePanel
        rootPath="/vault"
        documents={[
          {
            ...documents[0],
            resources: ['markune-asset://first', 'markune-asset://second'],
          },
        ]}
      />,
    );
    await user.click(
      await screen.findByRole('button', { name: '查看大图 first.png' }),
    );
    expect(
      screen
        .getByRole('button', { name: '上一张图片' })
        .hasAttribute('disabled'),
    ).toBe(true);
    await user.keyboard('{ArrowRight}');
    const dialog = screen.getByRole('dialog', { name: 'second.png' });
    fireEvent.error(within(dialog).getByRole('img', { name: 'second.png' }));
    expect(within(dialog).getByRole('alert').textContent).toContain(
      '图片无法显示',
    );
    expect(
      screen
        .getByRole('button', { name: '下一张图片' })
        .hasAttribute('disabled'),
    ).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: '查看大图 first.png' }),
      ),
    );
  });

  it('shows download failures inside the open preview', async () => {
    vi.mocked(writeExportFile).mockRejectedValue(
      new Error('Permission denied: private path'),
    );
    const user = userEvent.setup();
    render(<WorkspaceResourcePanel rootPath="/vault" documents={documents} />);
    await user.click(
      await screen.findByRole('button', { name: '查看大图 架构图.png' }),
    );
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '下载图片' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain(
      '保存失败',
    );
    expect(screen.queryByText(/private path/)).toBeNull();
  });

  it('does not launch a save dialog when a pending read belongs to a closed workspace', async () => {
    let finish!: (value: typeof data) => void;
    vi.mocked(readWorkspaceAssetData).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    const { rerender } = render(
      <WorkspaceResourcePanel rootPath="/vault" documents={documents} />,
    );
    await user.click(
      await screen.findByRole('button', { name: '下载图片 架构图.png' }),
    );
    rerender(<WorkspaceResourcePanel rootPath="/another" documents={[]} />);
    finish(data);
    await waitFor(() => expect(screen.getByText('暂无资源')).toBeTruthy());
    expect(selectWorkspaceAssetDownloadPath).not.toHaveBeenCalled();
    expect(writeExportFile).not.toHaveBeenCalled();
  });

  it('retains PDF reading and marks unresolved attachments directly in the list', async () => {
    vi.mocked(resolveDocumentAssets).mockImplementation(
      async (_root, _document, sources) =>
        sources.map((src) => ({
          src,
          absolutePath: src.endsWith('.pdf') ? '/vault/guide.pdf' : null,
        })),
    );
    const user = userEvent.setup();
    const onReadPdf = vi.fn();
    render(
      <WorkspaceResourcePanel
        rootPath="/vault"
        documents={[
          { ...documents[0], resources: ['./guide.pdf', './missing.png'] },
        ]}
        onReadPdf={onReadPdf}
      />,
    );
    await user.click(await screen.findByRole('button', { name: '阅读 PDF' }));
    expect(onReadPdf).toHaveBeenCalledWith({
      documentPath: '/vault/notes/practice.md',
      source: './guide.pdf',
      name: 'guide.pdf',
    });
    expect(screen.getByText('missing.png')).toBeTruthy();
    expect(screen.getByText('guide.pdf')).toBeTruthy();
    expect(screen.getByText('无法读取')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /检查资源|需检查的资源/ }),
    ).toBeNull();
  });

  it('shows recognizable image metadata without exposing raw paths or the old explanation', async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceResourcePanel
        rootPath="/vault"
        documents={documents}
        onOpen={vi.fn()}
      />,
    );
    const preview = await screen.findByRole('button', {
      name: '查看大图 架构图.png',
    });
    const img = preview.querySelector('img')!;
    Object.defineProperties(img, {
      naturalWidth: { value: 1200 },
      naturalHeight: { value: 800 },
    });
    fireEvent.load(img);
    expect(screen.getByText('· 1200 × 800')).toBeTruthy();
    expect(screen.getByText('· 2.0 KB')).toBeTruthy();
    expect(screen.queryByText(asset.absolutePath)).toBeNull();
    expect(screen.queryByText(/网络地址不自动下载检查/)).toBeNull();
    await user.type(
      screen.getByRole('searchbox', { name: '搜索资源' }),
      '架构',
    );
    expect(
      screen.getByRole('button', { name: '查看大图 架构图.png' }),
    ).toBeTruthy();
  });

  it('opens a large image, toggles natural size, and restores keyboard focus on Escape', async () => {
    const user = userEvent.setup();
    render(<WorkspaceResourcePanel rootPath="/vault" documents={documents} />);
    const trigger = await screen.findByRole('button', {
      name: '查看大图 架构图.png',
    });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: '架构图.png' });
    const image = within(dialog).getByRole('img', { name: '架构图.png' });
    Object.defineProperties(image, {
      naturalWidth: { value: 2000 },
      naturalHeight: { value: 1400 },
    });
    fireEvent.load(image);
    await user.click(within(dialog).getByRole('button', { name: '原始尺寸' }));
    expect(
      within(dialog)
        .getByRole('button', { name: '适应窗口' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('downloads the original bytes through the existing native save flow', async () => {
    const user = userEvent.setup();
    render(<WorkspaceResourcePanel rootPath="/vault" documents={documents} />);
    await user.click(
      await screen.findByRole('button', { name: '下载图片 架构图.png' }),
    );
    await waitFor(() =>
      expect(writeExportFile).toHaveBeenCalledWith(
        '/downloads/架构图.png',
        data.base64Data,
      ),
    );
    expect(readWorkspaceAssetData).toHaveBeenCalledWith('/vault', 'diagram');
    expect(selectWorkspaceAssetDownloadPath).toHaveBeenCalledWith(
      '架构图.png',
      'image/png',
    );
    expect(await screen.findByRole('status')).toBeTruthy();
  });

  it('does not write a file or show success when the save dialog is cancelled', async () => {
    vi.mocked(selectWorkspaceAssetDownloadPath).mockResolvedValue(null);
    const user = userEvent.setup();
    render(<WorkspaceResourcePanel rootPath="/vault" documents={documents} />);
    await user.click(
      await screen.findByRole('button', { name: '下载图片 架构图.png' }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: '下载图片 架构图.png' })
          .hasAttribute('disabled'),
      ).toBe(false),
    );
    expect(writeExportFile).not.toHaveBeenCalled();
    expect(screen.queryByText(/已保存/)).toBeNull();
  });

  it('reads ordinary relative images in the referring document context', async () => {
    vi.mocked(resolveDocumentAssets).mockResolvedValue([
      { src: './image.png', absolutePath: '/vault/notes/image.png' },
    ]);
    vi.mocked(readDocumentAssetData).mockResolvedValue(data);
    const user = userEvent.setup();
    render(
      <WorkspaceResourcePanel
        rootPath="/vault"
        documents={[{ ...documents[0], resources: ['./image.png'] }]}
      />,
    );
    await user.click(
      await screen.findByRole('button', { name: '下载图片 image.png' }),
    );
    await waitFor(() =>
      expect(readDocumentAssetData).toHaveBeenCalledWith(
        '/vault',
        '/vault/notes/practice.md',
        './image.png',
      ),
    );
    expect(readWorkspaceAssetData).not.toHaveBeenCalled();
  });

  it('opens the resource menu by keyboard and restores trigger focus on Escape', async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceResourcePanel
        rootPath="/vault"
        documents={documents}
        onOpen={vi.fn()}
      />,
    );
    const more = await screen.findByRole('button', {
      name: '更多操作 架构图.png',
    });
    more.focus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('menuitem', { name: '在文件夹中显示' }),
      ),
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(more));
  });

  it('keeps path actions in the menu and follows the referring note', async () => {
    const user = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const onOpen = vi.fn();
    render(
      <WorkspaceResourcePanel
        rootPath="/vault"
        documents={documents}
        onOpen={onOpen}
      />,
    );
    await user.click(
      await screen.findByRole('button', { name: '更多操作 架构图.png' }),
    );
    await user.click(screen.getByRole('menuitem', { name: '复制路径' }));
    expect(copy).toHaveBeenCalledWith(asset.absolutePath);
    await user.click(
      screen.getByRole('button', { name: '更多操作 架构图.png' }),
    );
    await user.click(screen.getByRole('menuitem', { name: '在文件夹中显示' }));
    expect(openPathInFileManager).toHaveBeenCalledWith(asset.absolutePath);
    await user.click(screen.getByText('1 篇笔记引用'));
    await user.click(screen.getByRole('button', { name: '技术实践' }));
    expect(onOpen).toHaveBeenCalledWith({ relativePath: 'notes/practice.md' });
  });

  it('does not load network images automatically and supports explicit preview', async () => {
    const source = 'https://example.com/image';
    const user = userEvent.setup();
    render(
      <WorkspaceResourcePanel
        rootPath="/vault"
        documents={[{ ...documents[0], resources: [source] }]}
        imageSources={[source]}
      />,
    );
    const trigger = await screen.findByRole('button', {
      name: '查看大图 image',
    });
    expect(trigger.querySelector('img')).toBeNull();
    expect(resolveWorkspaceAsset).not.toHaveBeenCalled();
    expect(resolveDocumentAssets).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '打开原图' }));
    expect(openUrlInDefaultBrowser).toHaveBeenCalledWith(source);
    await user.click(trigger);
    expect(screen.getByRole('img', { name: 'image' }).getAttribute('src')).toBe(
      source,
    );
    expect(
      screen.getByRole('img', { name: 'image' }).getAttribute('referrerpolicy'),
    ).toBe('no-referrer');
  });

  it('shows image failures inline without a resource-checking toolbar', async () => {
    render(<WorkspaceResourcePanel rootPath="/vault" documents={documents} />);
    const trigger = await screen.findByRole('button', {
      name: '查看大图 架构图.png',
    });
    fireEvent.error(trigger.querySelector('img')!);
    expect(screen.getByText('无法预览')).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: '搜索资源' })).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /检查资源|需检查的资源/ }),
    ).toBeNull();
    expect(resolveWorkspaceAsset).toHaveBeenCalledTimes(1);
  });

  it('does not offer more results after filtering a large collection down to one', async () => {
    const user = userEvent.setup();
    const sources = Array.from(
      { length: 101 },
      (_, index) => `https://example.com/${index}.png`,
    );
    render(
      <WorkspaceResourcePanel
        rootPath="/vault"
        documents={[{ ...documents[0], resources: sources }]}
      />,
    );
    await screen.findByRole('button', { name: '显示更多（剩余 1）' });
    await user.type(screen.getByRole('searchbox'), '100.png');
    expect(screen.queryByRole('button', { name: /显示更多/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^查看大图/ })).toHaveLength(
      1,
    );
  });

  it('discards a late resolver result after switching workspaces', async () => {
    let finish!: (value: typeof asset) => void;
    vi.mocked(resolveWorkspaceAsset).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { rerender } = render(
      <WorkspaceResourcePanel rootPath="/vault" documents={documents} />,
    );
    rerender(<WorkspaceResourcePanel rootPath="/another" documents={[]} />);
    finish(asset);
    await waitFor(() => expect(screen.getByText('暂无资源')).toBeTruthy());
    expect(
      screen.queryByRole('button', { name: '查看大图 架构图.png' }),
    ).toBeNull();
  });
});
