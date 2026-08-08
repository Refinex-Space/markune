import type {
  AppearanceFontSettings,
  AppSettings,
  CalendarSettings,
} from './workspace-types';

export const DEFAULT_APPEARANCE_FONTS: AppearanceFontSettings = {
  code: 'JetBrains Mono',
  document: 'Songti SC',
  ui: 'SF Pro Text',
};

export const MIN_WINDOW_OPACITY = 70;
export const MAX_WINDOW_OPACITY = 100;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  appearance: {
    fonts: DEFAULT_APPEARANCE_FONTS,
    pageWidthMode: 'wide',
    systemNavCollapsed: false,
    systemNavLayout: 'vertical',
    windowOpacity: MAX_WINDOW_OPACITY,
  },
  calendar: {
    expanded: true,
    weekStartsOn: 'monday',
  },
  schemaVersion: 1,
  storage: {
    defaultProvider: 'local',
  },
};

export function withDefaultAppSettings(
  settings: Omit<Partial<AppSettings>, 'appearance' | 'calendar'> & {
    appearance?: Partial<AppSettings['appearance']> & {
      fonts?: Partial<AppearanceFontSettings>;
    };
    calendar?: Partial<CalendarSettings>;
  },
): AppSettings {
  const windowOpacity = settings.appearance?.windowOpacity;

  return {
    ...DEFAULT_APP_SETTINGS,
    ...settings,
    appearance: {
      ...DEFAULT_APP_SETTINGS.appearance,
      ...settings.appearance,
      windowOpacity:
        typeof windowOpacity === 'number' &&
        Number.isInteger(windowOpacity) &&
        windowOpacity >= MIN_WINDOW_OPACITY &&
        windowOpacity <= MAX_WINDOW_OPACITY
          ? windowOpacity
          : MAX_WINDOW_OPACITY,
      fonts: {
        ...DEFAULT_APP_SETTINGS.appearance.fonts,
        ...settings.appearance?.fonts,
      },
    },
    calendar: {
      ...DEFAULT_APP_SETTINGS.calendar,
      ...settings.calendar,
    },
    storage: {
      ...DEFAULT_APP_SETTINGS.storage,
      ...settings.storage,
    },
  };
}
