import { describe, expect, it, vi } from 'vitest';

import { prepareProfessionalDocument } from '../document-export-professional';

describe('prepareProfessionalDocument', () => {
  it('normalizes Madora-only syntax and replaces rendered Mermaid with a PNG asset', async () => {
    const snapshot = document.createElement('section');
    snapshot.innerHTML = `
      <div class="markweave-mermaid-preview">
        <svg viewBox="0 0 640 320"><text>diagram</text></svg>
      </div>
    `;
    const rasterize = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    const result = await prepareProfessionalDocument({
      markdown: [
        '---',
        'title: Spring Boot 介绍',
        'updatedAt: 2026-07-23',
        '---',
        '# Spring Boot 介绍',
        '',
        '参见 [[技术随笔/Markweave npm 发布手册|发布手册]]。',
        '',
        '![远程架构图](https://example.com/diagram.png)',
        '',
        '```mermaid',
        'flowchart LR',
        '  A --> B',
        '```',
      ].join('\n'),
      rasterizeSvg: rasterize,
      snapshot,
    });

    expect(result.markdown).not.toContain('title: Spring Boot 介绍');
    expect(result.markdown).toContain('updatedAt: 2026-07-23');
    expect(result.markdown).toContain('参见 发布手册。');
    expect(result.markdown).toContain(
      '[远程架构图](https://example.com/diagram.png)',
    );
    expect(result.markdown).toContain(
      '![Mermaid 图表 1](./__MADORA_EXPORT_STEM__.assets/madora-diagram-1.png)',
    );
    expect(result.markdown).not.toContain('```mermaid');
    expect(result.files).toEqual([
      {
        base64Data: 'AQID',
        relativePath: 'madora-diagram-1.png',
        role: 'asset',
      },
    ]);
    expect(result.warnings).toEqual([
      '1 个远程图片未下载，已转换为可点击链接。',
    ]);
    expect(rasterize).toHaveBeenCalledWith(
      expect.stringContaining('<svg'),
      640,
      320,
    );
  });

  it('keeps Mermaid source and reports a warning when no rendered preview is available', async () => {
    const result = await prepareProfessionalDocument({
      markdown: '```mermaid\nflowchart LR\nA --> B\n```',
      snapshot: document.createElement('section'),
    });

    expect(result.markdown).toContain('```mermaid');
    expect(result.files).toEqual([]);
    expect(result.warnings).toContain(
      '第 1 个 Mermaid 图表没有可用预览，已保留源代码。',
    );
  });

  it('does not rewrite wiki or remote-image syntax inside ordinary code fences', async () => {
    const markdown = [
      '```text',
      '[[target|alias]]',
      '![image](https://example.com/image.png)',
      '```',
    ].join('\n');
    const result = await prepareProfessionalDocument({
      markdown,
      snapshot: document.createElement('section'),
    });

    expect(result.markdown).toBe(markdown);
    expect(result.warnings).toEqual([]);
  });

  it('removes an empty duplicate-title frontmatter block', async () => {
    const result = await prepareProfessionalDocument({
      markdown: '---\ntitle: "标题"\n---\n# 标题\n\n正文',
      snapshot: document.createElement('section'),
    });

    expect(result.markdown).toBe('# 标题\n\n正文');
  });

  it('keeps Mermaid preview ordering when an earlier preview failed', async () => {
    const snapshot = document.createElement('section');
    snapshot.innerHTML = `
      <div class="markweave-mermaid-preview markweave-mermaid-preview--error">错误</div>
      <div class="markweave-mermaid-preview">
        <svg viewBox="0 0 100 50"><text>second</text></svg>
      </div>
    `;
    const rasterize = vi.fn().mockResolvedValue(new Uint8Array([1]));
    const result = await prepareProfessionalDocument({
      markdown: [
        '```mermaid',
        'first',
        '```',
        '',
        '```mermaid',
        'second',
        '```',
      ].join('\n'),
      rasterizeSvg: rasterize,
      snapshot,
    });

    expect(result.markdown).toContain('```mermaid\nfirst\n```');
    expect(result.markdown).toContain(
      '![Mermaid 图表 2](./__MADORA_EXPORT_STEM__.assets/madora-diagram-2.png)',
    );
    expect(result.warnings).toContain(
      '第 1 个 Mermaid 图表没有可用预览，已保留源代码。',
    );
    expect(rasterize).toHaveBeenCalledOnce();
  });
});
