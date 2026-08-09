import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const uiDirectory = join(process.cwd(), 'components/ui');

describe('menu surfaces', () => {
  it('does not add elevation shadows to context, dropdown, or select menus', () => {
    const menuSources = [
      'context-menu.tsx',
      'dropdown-menu.tsx',
      'select.tsx',
    ].map((fileName) => readFileSync(join(uiDirectory, fileName), 'utf8'));

    for (const source of menuSources) {
      expect(source).not.toMatch(/shadow-/);
    }
  });
});
