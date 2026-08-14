import { beforeEach, describe, expect, it, vi } from 'vitest';

import { migrateLegacyBrowserStorage } from '../brand-migration';

describe('migrateLegacyBrowserStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('copies legacy Markune-owned keys and removes them after a successful write', () => {
    window.localStorage.setItem('madora:recent-workspace-path', '/notes');
    window.localStorage.setItem('unrelated', 'keep');

    migrateLegacyBrowserStorage();

    expect(window.localStorage.getItem('markune:recent-workspace-path')).toBe(
      '/notes',
    );
    expect(window.localStorage.getItem('madora:recent-workspace-path')).toBeNull();
    expect(window.localStorage.getItem('unrelated')).toBe('keep');
  });

  it('never overwrites an existing current-brand key', () => {
    window.localStorage.setItem('madora:workspace-history', 'legacy');
    window.localStorage.setItem('markune:workspace-history', 'current');

    migrateLegacyBrowserStorage();

    expect(window.localStorage.getItem('markune:workspace-history')).toBe(
      'current',
    );
    expect(window.localStorage.getItem('madora:workspace-history')).toBe(
      'legacy',
    );
  });
});
