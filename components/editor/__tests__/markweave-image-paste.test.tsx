import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  MarkweaveEditor,
  type MarkweaveEditorUpdatePayload,
  type MarkweaveSlashCommandUploadHandler,
} from '@markweave/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDrawingMarkdownReferenceHtml } from '@/components/editor/drawing-markdown-reference';
import { MarkdownEditor } from '@/components/editor/markdown-editor';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
}));

vi.mock('@/components/workspace/workspace-api', () => {
  const resolveWorkspaceAsset = vi.fn();

  return {
    resolveWorkspaceAsset,
    resolveWorkspaceAssets: vi.fn(
      async (rootPath: string, assetIds: string[]) => ({
        items: await Promise.all(
          assetIds.map(async (assetId) => {
            const asset = await resolveWorkspaceAsset(rootPath, assetId);
            return asset
              ? { asset, id: assetId, status: 'resolved' }
              : { id: assetId, status: 'missing' };
          }),
        ),
      }),
    ),
    uploadWorkspaceAsset: vi.fn(),
  };
});

import { useWorkspaceAssetUploader } from '@/components/editor/use-workspace-asset-uploader';
import {
  resolveWorkspaceAsset,
  uploadWorkspaceAsset,
} from '@/components/workspace/workspace-api';

function WorkspaceAssetEditor({
  documentKey,
  markdown,
}: {
  documentKey: string;
  markdown: string;
}) {
  const { editorMarkdown, resolveMediaSource } = useWorkspaceAssetUploader(
    '/ws/root',
    markdown,
  );

  return (
    editorMarkdown === null ? null : (
      <MarkweaveEditor
        content={editorMarkdown}
        contentFormat="markdown"
        key={documentKey}
        {...{ resolveMediaSource }}
      />
    )
  );
}

function DrawingReferenceEditor({ markdown }: { markdown: string }) {
  const [value, setValue] = React.useState(markdown);

  return (
    <>
      <MarkdownEditor
        documentKey="drawing-reference.md"
        markdown={value}
        workspaceRootPath="/ws/root"
        onMarkdownChange={setValue}
      />
      <output data-testid="drawing-reference-storage">{value}</output>
    </>
  );
}

function ControlledWorkspaceAssetEditor({
  markdown,
  onEditor,
}: {
  markdown: string;
  onEditor?: (editor: MarkweaveEditorUpdatePayload['editor']) => void;
}) {
  const [value, setValue] = React.useState(markdown);
  const { editorMarkdown, onSlashCommandUpload, toStorageMarkdown } =
    useWorkspaceAssetUploader('/ws/root', markdown);

  return (
    <>
      {editorMarkdown === null ? null : (
        <MarkweaveEditor
          content={editorMarkdown}
          contentFormat="markdown"
          onSlashCommandUpload={onSlashCommandUpload}
          onUpdate={(payload) => {
            onEditor?.(payload.editor);
            setValue(toStorageMarkdown(payload.markdown));
          }}
        />
      )}
      <output data-testid="workspace-asset-storage">{value}</output>
    </>
  );
}

describe('Markweave image integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('把剪贴板图片交给 Madora 提供的上传处理器并展示返回地址', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'screenshot.png', {
      type: 'image/png',
    });
    const onUpload = vi.fn<MarkweaveSlashCommandUploadHandler>(async () => ({
      src: 'asset://workspace/.madora/assets/files/ab/hash.png',
      name: 'screenshot.png',
      mimeType: 'image/png',
      size: 3,
    }));

    render(
      <MarkweaveEditor
        defaultContent=""
        defaultContentFormat="markdown"
        onSlashCommandUpload={onUpload}
      />,
    );

    const surface = await screen.findByTestId('markweave-editor-surface');
    fireEvent.paste(surface, {
      clipboardData: {
        files: [file],
        getData: () => '',
      },
    });

    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledWith({
        kind: 'image',
        source: {
          file,
          mimeType: 'image/png',
          type: 'file',
        },
        trigger: 'image-insert',
      });
    });
    await waitFor(() => {
      expect(surface.querySelector('img')?.getAttribute('src')).toBe(
        'asset://workspace/.madora/assets/files/ab/hash.png',
      );
    });
  });

  it('已有本地图片的受控文档一次粘贴即可保留新图片', async () => {
    const existingAssetId = 'a'.repeat(64);
    const uploadedAssetId = 'b'.repeat(64);
    const existingMarkdown =
      `![旧图](madora-asset://${existingAssetId})\n\n继续编辑`;
    vi.mocked(resolveWorkspaceAsset).mockResolvedValue({
      absolutePath: `/ws/.madora/assets/files/aa/${existingAssetId}.png`,
      id: existingAssetId,
      mediaType: 'image/png',
      name: 'existing.png',
      size: 10,
    });
    vi.mocked(uploadWorkspaceAsset).mockResolvedValue({
      absolutePath: `/ws/.madora/assets/files/bb/${uploadedAssetId}.png`,
      id: uploadedAssetId,
      mediaType: 'image/png',
      name: 'clipboard.png',
      relativePath: `.madora/assets/files/bb/${uploadedAssetId}.png`,
      size: 3,
      url: `madora-asset://${uploadedAssetId}`,
    });
    let editor: MarkweaveEditorUpdatePayload['editor'] | null = null;

    render(
      <ControlledWorkspaceAssetEditor
        markdown={existingMarkdown}
        onEditor={(nextEditor) => {
          editor = nextEditor;
        }}
      />,
    );
    const surface = await screen.findByTestId('markweave-editor-surface');
    await waitFor(() => {
      expect(surface.querySelectorAll('img')).toHaveLength(1);
      expect(editor).not.toBeNull();
    });
    act(() => {
      editor!.commands.setTextSelection(editor!.state.doc.content.size - 1);
    });
    const file = new File([new Uint8Array([1, 2, 3])], 'clipboard.png', {
      type: 'image/png',
    });

    fireEvent.paste(surface, {
      clipboardData: {
        files: [file],
        getData: () => '',
      },
    });

    await waitFor(() => {
      expect(uploadWorkspaceAsset).toHaveBeenCalledTimes(1);
      expect(surface.querySelectorAll('img')).toHaveLength(2);
    });
    expect(
      screen.getByTestId('workspace-asset-storage').textContent,
    ).toContain(`madora-asset://${uploadedAssetId}`);
  });

  it('含本地图片的有序列表连续回车只新增一项并正常退出', async () => {
    const assetId = 'c'.repeat(64);
    const markdown =
      `![图](madora-asset://${assetId})\n\n` +
      '1. 一\n2. 二\n3. 三\n4. 四\n5. 五\n6. 六\n7. 七';
    vi.mocked(resolveWorkspaceAsset).mockResolvedValue({
      absolutePath: `/ws/.madora/assets/files/cc/${assetId}.png`,
      id: assetId,
      mediaType: 'image/png',
      name: 'list.png',
      size: 10,
    });
    let editor: MarkweaveEditorUpdatePayload['editor'] | null = null;

    render(
      <ControlledWorkspaceAssetEditor
        markdown={markdown}
        onEditor={(nextEditor) => {
          editor = nextEditor;
        }}
      />,
    );
    const surface = await screen.findByTestId('markweave-editor-surface');
    await waitFor(() => {
      expect(surface.querySelector('img')?.getAttribute('src')).toContain(
        assetId,
      );
      expect(editor).not.toBeNull();
    });

    let listEnd = 0;
    editor!.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === '七') {
        listEnd = pos + node.nodeSize;
      }
    });
    act(() => {
      editor!.commands.setTextSelection(listEnd);
    });

    fireEvent.keyDown(surface, { code: 'Enter', key: 'Enter' });

    await waitFor(() => {
      expect(surface.querySelectorAll('ol > li')).toHaveLength(8);
    });
    fireEvent.keyDown(surface, { code: 'Enter', key: 'Enter' });

    await waitFor(() => {
      expect(surface.querySelectorAll('ol > li')).toHaveLength(7);
      expect(editor!.state.selection.$from.parent.type.name).toBe('paragraph');
      expect(editor!.isActive('orderedList')).toBe(false);
    });
  });

  it('直接插入带图片扩展名的远程 URL 而不要求上传处理器', async () => {
    render(
      <MarkweaveEditor defaultContent="" defaultContentFormat="markdown" />,
    );

    const surface = screen.getByTestId('markweave-editor-surface');
    fireEvent.paste(surface, {
      clipboardData: {
        files: [],
        getData: (type: string) =>
          type === 'text/plain'
            ? 'https://cdn.example.com/diagram.webp?theme=dark'
            : '',
      },
    });

    await waitFor(() => {
      expect(surface.querySelector('img')?.getAttribute('src')).toBe(
        'https://cdn.example.com/diagram.webp?theme=dark',
      );
    });
  });

  it('拒绝非内容哈希的自定义协议图片', () => {
    render(
      <MarkweaveEditor defaultContent="" defaultContentFormat="markdown" />,
    );

    const surface = screen.getByTestId('markweave-editor-surface');
    fireEvent.paste(surface, {
      clipboardData: {
        files: [],
        getData: (type: string) =>
          type === 'text/html'
            ? '<img alt="bad" src="madora-asset://short-id">'
            : '',
      },
    });

    expect(surface.querySelector('img')).toBeNull();
  });

  it('文档移动到其他层级并重新挂载后仍按资产协议解析图片', async () => {
    vi.mocked(resolveWorkspaceAsset).mockResolvedValue({
      absolutePath: '/ws/.madora/assets/files/ab/hash.png',
      id: 'hash',
      mediaType: 'image/png',
      name: 'cover.png',
      size: 5,
    });
    const markdown = '![封面](madora-asset://hash)';

    const firstMount = render(
      <WorkspaceAssetEditor documentKey="guide.md" markdown={markdown} />,
    );

    await waitFor(() => {
      expect(
        screen
          .getByTestId('markweave-editor-surface')
          .querySelector('img')
          ?.getAttribute('src'),
      ).toBe('asset:///ws/.madora/assets/files/ab/hash.png');
    });

    firstMount.unmount();

    render(
      <WorkspaceAssetEditor
        documentKey="docs/nested/guide.md"
        markdown={markdown}
      />,
    );

    await waitFor(() => {
      expect(
        screen
          .getByTestId('markweave-editor-surface')
          .querySelector('img')
          ?.getAttribute('src'),
      ).toBe('asset:///ws/.madora/assets/files/ab/hash.png');
    });
    expect(resolveWorkspaceAsset).toHaveBeenCalledTimes(2);
    expect(resolveWorkspaceAsset).toHaveBeenLastCalledWith('/ws/root', 'hash');
  });

  it('在 Live 模式粘贴图稿引用后显示快照并保留稳定回链', async () => {
    const assetId = 'd0f45cd65e487641a2bed39aaf81f718b7bc6969ac49520911230b69fe219156';
    const drawingId = '98a5fa9b-ef6d-4218-adc6-e29a5f17929c';
    const markdown =
      `[![测试1](madora-asset://${assetId})](madora-drawing://${drawingId})`;
    vi.mocked(resolveWorkspaceAsset).mockResolvedValue({
      absolutePath: `/ws/.madora/assets/files/d0/${assetId}.png`,
      id: assetId,
      mediaType: 'image/png',
      name: '测试1.png',
      size: 8899,
    });
    const onOpenDrawing = vi.fn();
    window.addEventListener('madora:open-drawing', onOpenDrawing);

    render(<DrawingReferenceEditor markdown="" />);
    const surface = screen.getByTestId('markweave-editor-surface');
    fireEvent.paste(surface, {
      clipboardData: {
        files: [],
        getData: (type: string) => {
          if (type === 'text/html') {
            return createDrawingMarkdownReferenceHtml(markdown);
          }
          return type === 'text/plain' ? markdown : '';
        },
      },
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('drawing-reference-storage').textContent?.trimEnd(),
      ).toBe(markdown);
    });
    await waitFor(() => {
      expect(surface.querySelector('img')?.getAttribute('src')).toBe(
        `asset:///ws/.madora/assets/files/d0/${assetId}.png`,
      );
    });

    fireEvent.click(surface.querySelector('img')!);
    expect(onOpenDrawing).toHaveBeenCalledTimes(1);
    expect((onOpenDrawing.mock.calls[0][0] as CustomEvent).detail).toEqual({
      drawingId,
    });
    window.removeEventListener('madora:open-drawing', onOpenDrawing);
  });

  it('富剪贴板不可用时仍能从纯文本图稿引用恢复快照', async () => {
    const assetId = 'd0f45cd65e487641a2bed39aaf81f718b7bc6969ac49520911230b69fe219156';
    const drawingId = '98a5fa9b-ef6d-4218-adc6-e29a5f17929c';
    const markdown =
      `[![测试1](madora-asset://${assetId})](madora-drawing://${drawingId})`;
    vi.mocked(resolveWorkspaceAsset).mockResolvedValue({
      absolutePath: `/ws/.madora/assets/files/d0/${assetId}.png`,
      id: assetId,
      mediaType: 'image/png',
      name: '测试1.png',
      size: 8899,
    });

    render(<DrawingReferenceEditor markdown="" />);
    const surface = screen.getByTestId('markweave-editor-surface');
    fireEvent.paste(surface, {
      clipboardData: {
        files: [],
        getData: (type: string) =>
          type === 'text/plain' ? markdown : '',
      },
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('drawing-reference-storage').textContent?.trimEnd(),
      ).toBe(markdown);
    });
    expect(surface.querySelector('img')?.getAttribute('src')).toBe(
      `asset:///ws/.madora/assets/files/d0/${assetId}.png`,
    );
  });
});
