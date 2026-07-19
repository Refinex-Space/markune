import { describe, expect, it, vi } from 'vitest';

import {
  createDrawingMarkdownReference,
  createDrawingMarkdownReferenceHtml,
  projectDrawingMarkdownReferencesForEditor,
  restoreDrawingMarkdownReferencesFromEditor,
  writeDrawingMarkdownReferenceToClipboard,
} from '@/components/editor/drawing-markdown-reference';

const assetId = 'd0f45cd65e487641a2bed39aaf81f718b7bc6969ac49520911230b69fe219156';
const drawingId = '98a5fa9b-ef6d-4218-adc6-e29a5f17929c';
const markdown =
  `[![测试1](madora-asset://${assetId})](madora-drawing://${drawingId})`;

describe('drawing markdown reference', () => {
  it('builds a canonical reference from stable IDs instead of a display URL', () => {
    expect(
      createDrawingMarkdownReference({ assetId, drawingId, title: '测试1' }),
    ).toBe(markdown);
  });

  it('projects linked images for Markweave and restores the canonical markdown', () => {
    const projected = projectDrawingMarkdownReferencesForEditor(markdown);

    expect(projected).toBe(
      `![测试1](madora-asset://${assetId} "madora-drawing://${drawingId}")`,
    );
    expect(restoreDrawingMarkdownReferencesFromEditor(projected)).toBe(markdown);
  });

  it('recovers the exact escaped literal produced by the old live paste path', () => {
    const escaped =
      `\\[!\\[测试1\\](madora-asset://${assetId})\\](madora-drawing://${drawingId})`;

    expect(projectDrawingMarkdownReferencesForEditor(escaped)).toBe(
      `![测试1](madora-asset://${assetId} "madora-drawing://${drawingId}")`,
    );
  });

  it('does not turn arbitrary titled images into drawing references', () => {
    const externalImage =
      `![测试1](https://example.com/image.png "madora-drawing://${drawingId}")`;

    expect(restoreDrawingMarkdownReferencesFromEditor(externalImage)).toBe(
      externalImage,
    );
  });

  it('writes canonical plain text plus an editor-safe rich image', async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(
      navigator,
      'clipboard',
    );
    const originalClipboardItem = Object.getOwnPropertyDescriptor(
      globalThis,
      'ClipboardItem',
    );
    const write = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const items: Array<Record<string, Blob>> = [];
    Object.defineProperty(globalThis, 'ClipboardItem', {
      configurable: true,
      value: class {
        constructor(value: Record<string, Blob>) {
          items.push(value);
        }
      },
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write, writeText },
    });

    try {
      await writeDrawingMarkdownReferenceToClipboard(markdown);

      expect(write).toHaveBeenCalledTimes(1);
      expect(writeText).not.toHaveBeenCalled();
      expect(await items[0]['text/plain'].text()).toBe(markdown);
      expect(await items[0]['text/html'].text()).toBe(
        createDrawingMarkdownReferenceHtml(markdown),
      );
      expect(await items[0]['text/html'].text()).toContain(
        `src="madora-asset://${assetId}"`,
      );
      expect(await items[0]['text/html'].text()).not.toContain(
        'asset://localhost',
      );
    } finally {
      restoreProperty(navigator, 'clipboard', originalClipboard);
      restoreProperty(globalThis, 'ClipboardItem', originalClipboardItem);
    }
  });

  it('falls back to canonical plain text when rich clipboard writing fails', async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(
      navigator,
      'clipboard',
    );
    const originalClipboardItem = Object.getOwnPropertyDescriptor(
      globalThis,
      'ClipboardItem',
    );
    const write = vi.fn().mockRejectedValue(new Error('unsupported'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'ClipboardItem', {
      configurable: true,
      value: class {
        constructor() {}
      },
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write, writeText },
    });

    try {
      await writeDrawingMarkdownReferenceToClipboard(markdown);

      expect(write).toHaveBeenCalledTimes(1);
      expect(writeText).toHaveBeenCalledWith(markdown);
    } finally {
      restoreProperty(navigator, 'clipboard', originalClipboard);
      restoreProperty(globalThis, 'ClipboardItem', originalClipboardItem);
    }
  });
});

function restoreProperty(
  target: object,
  key: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }

  Reflect.deleteProperty(target, key);
}
