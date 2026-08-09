import { describe, expect, it } from 'vitest';

import { recordRecentTreeIcon } from '../tree-icon-preferences';
import type { TreeIconPickerSettings } from '../workspace-types';

describe('tree icon preferences', () => {
  it('deduplicates by icon identity, promotes the latest icon, and caps MRU', () => {
    const settings: TreeIconPickerSettings = {
      lastTab: 'builtin',
      recentIcons: Array.from({ length: 20 }, (_, index) => ({
        type: 'builtin' as const,
        name: `tabler:icon-${index}`,
      })),
    };

    const next = recordRecentTreeIcon(
      settings,
      { type: 'builtin', name: 'tabler:icon-8' },
      'builtin',
    );

    expect(next.recentIcons).toHaveLength(20);
    expect(next.recentIcons[0]).toEqual({
      type: 'builtin',
      name: 'tabler:icon-8',
    });
    expect(
      next.recentIcons.filter(
        (icon) => icon.type === 'builtin' && icon.name === 'tabler:icon-8',
      ),
    ).toHaveLength(1);
  });
});
