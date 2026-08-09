import { describe, expect, it } from 'vitest';

import { createBuiltinIconRegistry } from '../tree-icon-registry';

const registry = createBuiltinIconRegistry({
  height: 24,
  icons: {
    book: { body: '<path d="M1 1h2"/>' },
    'brand-github': { body: '<path d="M2 2h2"/>' },
    folder: { body: '<path d="M3 3h2"/>' },
    terminal: { body: '<path d="M4 4h2"/>' },
  },
  width: 24,
});

describe('tree icon registry', () => {
  it('indexes trusted icon data and supports Chinese aliases', () => {
    expect(registry.get('tabler:book')?.data.width).toBe(24);
    expect(registry.search('知识').map((icon) => icon.name)).toEqual([
      'tabler:book',
    ]);
    expect(registry.search('文件夹').map((icon) => icon.name)).toEqual([
      'tabler:folder',
    ]);
  });

  it('classifies icons without maintaining a full manual manifest', () => {
    expect(registry.get('tabler:brand-github')?.category).toBe('brands');
    expect(registry.get('tabler:terminal')?.category).toBe('common');
    expect(registry.search('')).toEqual([]);
  });
});
