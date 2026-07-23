import { describe, expect, it, vi } from 'vitest';

import {
  EXPORT_STEM_PLACEHOLDER,
  createStaticExportHtml,
  prepareDocumentAssets,
  resolveDocumentExportMarkdown,
  sanitizeExportFileStem,
  sanitizeMarkweaveSnapshot,
  waitForExportRender,
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
    source.dataset.markweaveInnerToc = 'true';
    source.dataset.markweaveInnerTocPlacement = 'container';
    source.dataset.markweaveLargeDocument = 'true';
    source.dataset.markweaveLargeDocumentLoading = 'false';
    source.style.setProperty('--markweave-inner-toc-right', '1468px');
    source.innerHTML = `
      <h1 contenteditable="true">标题</h1>
      <div data-markweave-large-document="true"><p>离屏正文</p></div>
      <input type="checkbox" checked>
      <a href="javascript:alert(1)">bad</a>
      <a href="https://example.com">good</a>
      <nav class="markweave-inner-toc"><button data-target="section">编辑器目录</button></nav>
      <nav data-toc><button data-target="section">浮动目录</button></nav>
      <div class="markweave-codeblock-overlay">编辑器悬浮层</div>
      <nav data-user-toc><a href="#section">手写目录</a></nav>
      <button>复制</button>
      <script>alert(1)</script>
    `;
    const snapshot = sanitizeMarkweaveSnapshot(source);

    expect(snapshot.querySelector('script')).toBeNull();
    expect(snapshot.querySelector('button')).toBeNull();
    expect(snapshot.querySelector('[contenteditable]')).toBeNull();
    expect(snapshot.querySelector('.markweave-inner-toc')).toBeNull();
    expect(snapshot.querySelector('[data-toc]')).toBeNull();
    expect(snapshot.querySelector('.markweave-codeblock-overlay')).toBeNull();
    expect(snapshot.hasAttribute('data-markweave-inner-toc')).toBe(false);
    expect(snapshot.hasAttribute('data-markweave-inner-toc-placement')).toBe(
      false,
    );
    expect(snapshot.hasAttribute('data-markweave-large-document')).toBe(false);
    expect(
      snapshot.hasAttribute('data-markweave-large-document-loading'),
    ).toBe(false);
    expect(
      snapshot.querySelector('[data-markweave-large-document]'),
    ).toBeNull();
    expect(snapshot.style.getPropertyValue('--markweave-inner-toc-right')).toBe(
      '',
    );
    expect(snapshot.querySelector('[data-user-toc]')?.textContent).toBe(
      '手写目录',
    );
    expect(snapshot.textContent).not.toContain('编辑器目录');
    expect(snapshot.textContent).not.toContain('浮动目录');
    expect(snapshot.textContent).not.toContain('编辑器悬浮层');
    expect(snapshot.textContent).toContain('☑');
    expect(snapshot.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(snapshot.querySelectorAll('a')[1].rel).toBe('noopener noreferrer');
  });

  it('waits for a lazy image source before deciding that the image is missing', async () => {
    const root = document.createElement('article');
    const image = document.createElement('img');
    let loaded = false;

    Object.defineProperties(image, {
      complete: {
        get: () => !image.hasAttribute('src') || loaded,
      },
      naturalWidth: {
        get: () => (loaded ? 320 : 0),
      },
    });
    root.append(image);

    window.setTimeout(() => {
      image.src = 'data:image/png;base64,cG5n';
      loaded = true;
      image.dispatchEvent(new Event('load'));
    }, 20);

    await waitForExportRender(root, 1_000);

    expect(image.dataset.exportMissing).toBeUndefined();
  });

  it('builds script-free current-theme HTML and professional A4 print HTML', async () => {
    const content = document.createElement('article');
    content.className = 'madora-export-document';
    content.innerHTML = '<h1>标题</h1><p>正文</p>';

    const dark = await createStaticExportHtml({
      content,
      pageWidthMode: 'wide',
      theme: 'dark',
      title: '标题',
    });
    const standard = await createStaticExportHtml({
      content,
      pageWidthMode: 'standard',
      theme: 'light',
      title: '标题',
    });
    const print = await createStaticExportHtml({
      content,
      forPrint: true,
      pageWidthMode: 'wide',
      theme: 'light',
      title: '标题',
    });

    expect(dark.html).toContain('<html class="dark"');
    expect(dark.html).toContain('data-page-width-mode="wide"');
    expect(dark.html).toContain('--madora-export-content-max:88rem');
    expect(standard.html).toContain('--madora-export-content-max:64rem');
    expect(dark.html).toContain("script-src 'none'");
    expect(dark.html).not.toContain('<script');
    expect(print.html).toContain('@page{size:A4;margin:18mm}');
    expect(print.html).toContain('<html class="light"');
  });
});
