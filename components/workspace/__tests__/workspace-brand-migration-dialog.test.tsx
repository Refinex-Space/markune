import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceBrandMigrationDialog } from '../workspace-brand-migration-dialog';

describe('WorkspaceBrandMigrationDialog', () => {
  it('explains the rebrand and starts migration only after explicit confirmation', async () => {
    const onMigrate = vi.fn(async () => undefined);

    render(
      <WorkspaceBrandMigrationDialog
        migration={{ rootPath: '/notes/legacy', state: 'legacy' }}
        onCancel={vi.fn()}
        onMigrate={onMigrate}
      />,
    );

    expect(screen.getByText('迁移工作区数据')).toBeTruthy();
    expect(
      screen.getByLabelText('数据目录从 .madora 迁移为 .markune'),
    ).toBeTruthy();
    expect(screen.getByText(/SHA-256/)).toBeTruthy();
    expect(screen.getByText('/notes/legacy')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '迁移并打开' }));

    await waitFor(() => {
      expect(onMigrate).toHaveBeenCalledTimes(1);
    });
  });

  it('blocks automatic migration when old and new data directories conflict', () => {
    render(
      <WorkspaceBrandMigrationDialog
        migration={{ rootPath: '/notes/conflict', state: 'conflict' }}
        onCancel={vi.fn()}
        onMigrate={vi.fn()}
      />,
    );

    expect(screen.getByText('工作区数据目录存在冲突')).toBeTruthy();
    expect(screen.getByText(/请先确认目录归属/)).toBeTruthy();
    expect(screen.getByText(/不会自动删除、合并或覆盖数据/)).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: '迁移并打开' }),
    ).toBeNull();
  });
});
