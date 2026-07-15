import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MarkweaveEditor, type MarkweaveSlashCommandUploadHandler } from '@markweave/react';
import { describe, expect, it, vi } from 'vitest';

describe('Markweave 0.2.4 image paste integration', () => {
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

    const surface = screen.getByTestId('markweave-editor-surface');
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
});
