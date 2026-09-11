import { describe, expect, it, vi } from 'vitest';
import { capturePastedImageStorage } from '../pasted-image-storage';

describe('pasted image storage', () => {
  function fixture() {
    const existing = {
      type: { name: 'image' },
      attrs: { src: 'https://example.com/a.png' },
    };
    const added = {
      type: { name: 'image' },
      attrs: { src: 'https://example.com/a.png', alt: 'new' },
    };
    let nodes = [existing];
    const transaction = { setNodeMarkup: vi.fn(), setMeta: vi.fn() };
    transaction.setNodeMarkup.mockReturnValue(transaction);
    transaction.setMeta.mockReturnValue(transaction);
    const editor = {
      isDestroyed: false,
      state: {
        doc: {
          descendants: (visit: (node: unknown, position: number) => void) =>
            nodes.forEach((node, i) => visit(node, i + 1)),
        },
        tr: transaction,
      },
      view: { dispatch: vi.fn() },
    };
    const clipboard = {
      files: [] as unknown as FileList,
      getData: (type: string) =>
        type === 'text/html'
          ? '<p>内容<img src="https://example.com/a.png"></p>'
          : '',
    };
    return {
      editor,
      clipboard,
      transaction,
      insert: () => {
        nodes = [existing, added];
      },
      undo: () => {
        nodes = [existing];
      },
    };
  }

  it('applies the upload rule only to the new pasted image and retains its attributes', async () => {
    const test = fixture();
    const upload = vi.fn(async () => ({ src: 'assets/a.png' }));
    const pending = capturePastedImageStorage(
      test.clipboard,
      test.editor as never,
      upload,
      vi.fn(),
    );
    test.insert();
    await pending;
    expect(upload).toHaveBeenCalledTimes(1);
    expect(test.transaction.setNodeMarkup).toHaveBeenCalledWith(2, undefined, {
      src: 'assets/a.png',
      alt: 'new',
    });
    expect(test.editor.view.dispatch).toHaveBeenCalledTimes(1);
  });

  it('does not resurrect an image the user removed while the copy was pending', async () => {
    const test = fixture();
    let finish!: (value: { src: string }) => void;
    const upload = vi.fn(
      () =>
        new Promise<{ src: string }>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = capturePastedImageStorage(
      test.clipboard,
      test.editor as never,
      upload,
      vi.fn(),
    );
    test.insert();
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    test.undo();
    finish({ src: 'assets/a.png' });
    await pending;
    expect(test.editor.view.dispatch).not.toHaveBeenCalled();
  });

  it('keeps the original URL when the rule is disabled or copying fails', async () => {
    const test = fixture();
    const onError = vi.fn();
    const pending = capturePastedImageStorage(
      test.clipboard,
      test.editor as never,
      async () => {
        throw new Error('download failed');
      },
      onError,
    );
    test.insert();
    await pending;
    expect(test.editor.view.dispatch).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('图片保存失败，已保留原网址。');
  });
  it('checks the disabled rule once without starting per-image uploads', async () => {
    const test = fixture();
    const upload = vi.fn();
    const shouldProcess = vi.fn(async () => false);
    const pending = capturePastedImageStorage(
      test.clipboard,
      test.editor as never,
      upload,
      vi.fn(),
      shouldProcess,
    );
    test.insert();
    await pending;
    expect(shouldProcess).toHaveBeenCalledTimes(1);
    expect(upload).not.toHaveBeenCalled();
  });
});
