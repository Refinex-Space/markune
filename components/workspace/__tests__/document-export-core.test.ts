import { describe, expect, it, vi } from 'vitest';

import {
  EXPORT_STEM_PLACEHOLDER,
  createStaticExportHtml,
  prepareDocumentAssets,
  resolveDocumentExportMarkdown,
  sanitizeExportFileStem,
  sanitizeMarkweaveSnapshot,
} from '../document-export-core';

describe('document export core', () => {
  it('cleans cross-platform file names and Windows device names', () => {
    expect(sanitizeExportFileStem('  计划: 2026 / Q3. ', 'note.md')).toBe(
      '计划 2026 Q3',
    );
    expect(sanitizeExportFileStem('CON', 'note.md')).toBe('_CON');
    expect(sanitizeExportFileStem('***', 'fallback.md')).toBe('fallback');
  });

  it('prefers the live draft, then an opened tab cache, then disk', async () => {
    const readDisk = vi.fn().mockResolvedValue('disk');

    await expect(
      resolveDocumentExportMarkdown({
        cachedMarkdown: 'cache',
        currentDocumentPath: '/repo/note.md',
        documentPath: '/repo/note.md',
        draftMarkdown: 'draft',
        readDisk,
      }),
    ).resolves.toBe('draft');
    await expect(
      resolveDocumentExportMarkdown({
        cachedMarkdown: 'cache',
        currentDocumentPath: '/repo/other.md',
        documentPath: '/repo/note.md',
        readDisk,
      }),
    ).resolves.toBe('cache');
    await expect(
      resolveDocumentExportMarkdown({
        currentDocumentPath: '/repo/other.md',
        documentPath: '/repo/note.md',
        readDisk,
      }),
    ).resolves.toBe('disk');
    expect(readDisk).toHaveBeenCalledOnce();
  });

  it('rewrites Markdown assets, embeds render images, and de-duplicates names', async () => {
    const readAsset = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'a',
        name: 'image.png',
        mediaType: 'image/png',
        base64Data: 'cG5n',
      })
      .mockResolvedValueOnce({
        id: 'b',
        name: 'image.png',
        mediaType: 'application/pdf',
        base64Data: 'cGRm',
      });
    const prepared = await prepareDocumentAssets(
      '/repo',
      '![图](madora-asset://a)\n[附件](madora-asset://b)',
      readAsset,
    );

    expect(prepared.portableMarkdown).toContain(
      `./${EXPORT_STEM_PLACEHOLDER}.assets/image.png`,
    );
    expect(prepared.portableMarkdown).toContain(
      `./${EXPORT_STEM_PLACEHOLDER}.assets/image%20%281%29.png`,
    );
    expect(prepared.renderMarkdown).toContain('data:image/png;base64,cG5n');
    expect(prepared.renderMarkdown).toContain(
      `./${EXPORT_STEM_PLACEHOLDER}.assets/image%20%281%29.png`,
    );
    expect(prepared.allAssetFiles.map((file) => file.relativePath)).toEqual([
      'image.png',
      'image (1).png',
    ]);
    expect(prepared.htmlAssetFiles).toHaveLength(1);
  });

  it('keeps missing references recognizable and returns a warning', async () => {
    const prepared = await prepareDocumentAssets(
      '/repo',
      '![缺失](madora-asset://missing)',
      vi.fn().mockRejectedValue(new Error('not found')),
    );

    expect(prepared.portableMarkdown).toContain('madora-asset://missing');
    expect(prepared.warnings).toEqual([
      '资源 missing 未能导出：not found',
    ]);
  });

  it('removes editor controls and scripts while preserving task state and safe links', () => {
    const source = document.createElement('article');
    source.innerHTML = `
      <h1 contenteditable="true">标题</h1>
      <input type="checkbox" checked>
      <a href="javascript:alert(1)">bad</a>
      <a href="https://example.com">good</a>
      <button>复制</button>
      <script>alert(1)</script>
    `;
    const snapshot = sanitizeMarkweaveSnapshot(source);

    expect(snapshot.querySelector('script')).toBeNull();
    expect(snapshot.querySelector('button')).toBeNull();
    expect(snapshot.querySelector('[contenteditable]')).toBeNull();
    expect(snapshot.textContent).toContain('☑');
    expect(snapshot.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(snapshot.querySelectorAll('a')[1].rel).toBe('noopener noreferrer');
  });

  it('builds script-free current-theme HTML and professional A4 print HTML', async () => {
    const content = document.createElement('article');
    content.className = 'madora-export-document';
    content.innerHTML = '<h1>标题</h1><p>正文</p>';

    const dark = await createStaticExportHtml({
      content,
      theme: 'dark',
      title: '标题',
    });
    const print = await createStaticExportHtml({
      content,
      forPrint: true,
      theme: 'light',
      title: '标题',
    });

    expect(dark.html).toContain('<html class="dark"');
    expect(dark.html).toContain("script-src 'none'");
    expect(dark.html).not.toContain('<script');
    expect(print.html).toContain('@page{size:A4;margin:18mm}');
    expect(print.html).toContain('<html class="light"');
  });
});
