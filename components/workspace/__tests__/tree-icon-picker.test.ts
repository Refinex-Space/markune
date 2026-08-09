import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../workspace-api', () => ({
  discardUnreferencedTreeIconAsset: vi.fn().mockResolvedValue(undefined),
  selectTreeIconAsset: vi.fn(),
}));

import {
  TREE_EMOJI_CATEGORIES,
  TREE_EMOJI_ITEMS,
} from '../tree-emoji-catalog';
import TreeIconPicker, { isSingleEmoji } from '../tree-icon-picker';
import { selectTreeIconAsset } from '../workspace-api';

describe('tree icon picker', () => {
  it('accepts one emoji grapheme and rejects text or multiple emoji', () => {
    expect(isSingleEmoji('📚')).toBe(true);
    expect(isSingleEmoji('👨‍👩‍👧‍👦')).toBe(true);
    expect(isSingleEmoji('hello')).toBe(false);
    expect(isSingleEmoji('📚🚀')).toBe(false);
    expect(isSingleEmoji(' 📚')).toBe(false);
  });

  it('provides a dense, searchable emoji catalog across Notion-style categories', () => {
    expect(TREE_EMOJI_CATEGORIES.map((category) => category.id)).toEqual([
      'common',
      'people',
      'nature',
      'food',
      'activity',
      'travel',
      'objects',
      'symbols',
      'flags',
    ]);
    expect(TREE_EMOJI_ITEMS.length).toBeGreaterThan(230);
    expect(
      TREE_EMOJI_ITEMS.some(
        ([emoji, keywords]) => emoji === '🧠' && keywords.includes('知识'),
      ),
    ).toBe(true);
    expect(
      TREE_EMOJI_ITEMS.some(
        ([emoji, keywords]) => emoji === '✈️' && keywords.includes('旅行'),
      ),
    ).toBe(true);
  });

  it('keeps the picker open after applying an uploaded icon', async () => {
    const user = userEvent.setup();
    const onAppearanceChange = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    const onPreferencesChange = vi.fn().mockResolvedValue(undefined);
    vi.mocked(selectTreeIconAsset).mockResolvedValue({
      assetId: 'asset-123',
      mediaType: 'image/png',
      name: 'folder.png',
    });

    render(
      React.createElement(TreeIconPicker, {
        anchor: { left: 480, top: 200 },
        node: {
          absolutePath: '/repo/Guides',
          id: 'guides',
          kind: 'directory',
          name: 'Guides',
          relativePath: 'Guides',
        },
        onAppearanceChange,
        onOpenChange,
        onPreferencesChange,
        open: true,
        preferences: { lastTab: 'local', recentIcons: [] },
        rootPath: '/repo',
      }),
    );

    await user.click(screen.getByRole('button', { name: '选择图片' }));

    await waitFor(() =>
      expect(onAppearanceChange).toHaveBeenCalledWith({
        icon: { type: 'local', assetId: 'asset-123' },
      }),
    );
    expect(onPreferencesChange).toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(
      screen.queryByRole('tablist', { name: '目录图标类型' }),
    ).not.toBeNull();
  });
});
