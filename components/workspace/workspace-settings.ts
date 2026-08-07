import type { AppearanceFontSettings, AppSettings } from './workspace-types';

export const DEFAULT_APPEARANCE_FONTS: AppearanceFontSettings = {
  code: 'JetBrains Mono',
  document: 'Songti SC',
  ui: 'SF Pro Text',
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  appearance: {
    fonts: DEFAULT_APPEARANCE_FONTS,
    pageWidthMode: 'wide',
    systemNavCollapsed: false,
    systemNavLayout: 'vertical',
  },
  schemaVersion: 1,
  storage: {
    defaultProvider: 'local',
  },
};

export function withDefaultAppSettings(
  settings: Partial<AppSettings> & {
    appearance?: Partial<AppSettings['appearance']> & {
      fonts?: Partial<AppearanceFontSettings>;
    };
  },
): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...settings,
    appearance: {
      ...DEFAULT_APP_SETTINGS.appearance,
      ...settings.appearance,
      fonts: {
        ...DEFAULT_APP_SETTINGS.appearance.fonts,
        ...settings.appearance?.fonts,
      },
    },
    storage: {
      ...DEFAULT_APP_SETTINGS.storage,
      ...settings.storage,
    },
  };
}
