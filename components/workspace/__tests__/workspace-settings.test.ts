import { describe, expect, it } from 'vitest';

import {
  DEFAULT_APP_SETTINGS,
  withDefaultAppSettings,
} from '../workspace-settings';

describe('workspace settings defaults', () => {
  it('fills calendar defaults for legacy settings', () => {
    const settings = withDefaultAppSettings({
      appearance: {
        fonts: DEFAULT_APP_SETTINGS.appearance.fonts,
        pageWidthMode: 'wide',
        systemNavCollapsed: false,
        systemNavLayout: 'vertical',
      },
      schemaVersion: 1,
      storage: { defaultProvider: 'local' },
    });

    expect(settings.calendar).toEqual({
      expanded: true,
      weekStartsOn: 'monday',
    });
    expect(settings.appearance.windowOpacity).toBe(100);
    expect(settings.appearance.showGitLogEntry).toBe(false);
    expect(settings.appearance.showGitPanelEntry).toBe(false);
    expect(settings.appearance.treeIconPicker).toEqual({
      lastTab: 'builtin',
      recentIcons: [],
    });
  });

  it('normalizes tree icon picker preferences from persisted settings', () => {
    const settings = withDefaultAppSettings({
      appearance: {
        treeIconPicker: {
          lastTab: 'emoji',
          recentIcons: [
            { type: 'emoji', value: '📚' },
            { type: 'builtin', name: 'tabler:book' },
            { type: 'builtin', name: 'invalid' },
          ],
        },
      },
      schemaVersion: 1,
      storage: { defaultProvider: 'local' },
    });

    expect(settings.appearance.treeIconPicker).toEqual({
      lastTab: 'emoji',
      recentIcons: [
        { type: 'emoji', value: '📚' },
        { type: 'builtin', name: 'tabler:book' },
      ],
    });
  });

  it('preserves enabled Git entry visibility settings', () => {
    const settings = withDefaultAppSettings({
      appearance: {
        showGitLogEntry: true,
        showGitPanelEntry: true,
      },
      schemaVersion: 1,
      storage: { defaultProvider: 'local' },
    });

    expect(settings.appearance.showGitLogEntry).toBe(true);
    expect(settings.appearance.showGitPanelEntry).toBe(true);
  });

  it('preserves provided calendar settings', () => {
    const settings = withDefaultAppSettings({
      calendar: { expanded: false, weekStartsOn: 'sunday' },
      schemaVersion: 1,
      storage: { defaultProvider: 'local' },
    });

    expect(settings.calendar).toEqual({
      expanded: false,
      weekStartsOn: 'sunday',
    });
  });

  it('falls back to full opacity when persisted opacity is outside the safe range', () => {
    const settings = withDefaultAppSettings({
      appearance: { windowOpacity: 40 },
      schemaVersion: 1,
      storage: { defaultProvider: 'local' },
    });

    expect(settings.appearance.windowOpacity).toBe(100);
  });
});
