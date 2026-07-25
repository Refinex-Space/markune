import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceGlobalSearchDialog } from '../workspace-global-search-dialog';

describe('WorkspaceGlobalSearchDialog', () => {
  it('uses a subtle rectangular shell without elevation', () => {
    render(
      <WorkspaceGlobalSearchDialog
        indexStatus="ready"
        open
        query=""
        results={[]}
        onOpenChange={vi.fn()}
        onQueryChange={vi.fn()}
        onSelectResult={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '搜索工作区' });
    const overlay = document.querySelector('[data-slot="dialog-overlay"]');

    expect(dialog.className).toContain('rounded-md');
    expect(dialog.className).toContain('shadow-none');
    expect(dialog.className).not.toContain('rounded-xl');
    expect(overlay?.className).toContain('bg-transparent');
    expect(overlay?.className).toContain('backdrop-blur-none');
    expect(overlay?.className).not.toContain('bg-black/10');
    expect(overlay?.className).not.toContain('backdrop-blur-xs');
  });
});
