import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const workspaceRoot = process.cwd();

describe('Codex workspace shell', () => {
  it('在视图下方提供 Codex 主工作区入口', () => {
    const sidebar = readFileSync(
      join(workspaceRoot, 'components/workspace/workspace-sidebar.tsx'),
      'utf8',
    );
    const views = sidebar.indexOf('data-testid="workspace-views-entry"');
    const codex = sidebar.indexOf('data-testid="codex-workspace-entry"');

    expect(views).toBeGreaterThan(-1);
    expect(codex).toBeGreaterThan(views);
    expect(sidebar).toContain("systemPage === 'codex'");
    expect(sidebar).toContain('<span className="truncate">Codex</span>');
  });

  it('以系统页切换展示形态而不是创建第二个 AiPanel', () => {
    const layout = readFileSync(
      join(workspaceRoot, 'components/workspace/workspace-layout.tsx'),
      'utf8',
    );
    const rightPanel = readFileSync(
      join(workspaceRoot, 'components/workspace/right-side-panel.tsx'),
      'utf8',
    );

    expect(layout).toContain("systemPage === 'codex'");
    expect(layout).toContain('aiPresentation=');
    expect(layout).toContain('handleOpenCodexPage');
    expect(rightPanel.match(/<AiPanel/g)).toHaveLength(1);
  });
});
