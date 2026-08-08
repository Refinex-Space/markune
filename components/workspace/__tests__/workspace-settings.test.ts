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
