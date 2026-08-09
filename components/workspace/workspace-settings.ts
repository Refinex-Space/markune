import type {
  AppearanceFontSettings,
  AppSettings,
  CalendarSettings,
  TreeNodeIcon,
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
    showGitLogEntry: false,
    showGitPanelEntry: false,
    systemNavCollapsed: false,
    systemNavLayout: 'vertical',
    treeIconPicker: {
      lastTab: 'builtin',
      recentIcons: [],
    },
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
      treeIconPicker: normalizeTreeIconPickerSettings(
        settings.appearance?.treeIconPicker,
      ),
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

function normalizeTreeIconPickerSettings(
  settings: Partial<AppSettings['appearance']['treeIconPicker']> | undefined,
): AppSettings['appearance']['treeIconPicker'] {
  const lastTab = settings?.lastTab;
  const recentIcons = Array.isArray(settings?.recentIcons)
    ? settings.recentIcons.filter(isTreeNodeIcon).slice(0, 20)
    : [];

  return {
    lastTab:
      lastTab === 'emoji' || lastTab === 'local' ? lastTab : 'builtin',
    recentIcons,
  };
}

function isTreeNodeIcon(icon: unknown): icon is TreeNodeIcon {
  if (!icon || typeof icon !== 'object') {
    return false;
  }
  const candidate = icon as Record<string, unknown>;
  if (candidate.type === 'builtin') {
    return (
      typeof candidate.name === 'string' &&
      candidate.name.length <= 135 &&
      /^tabler:[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(candidate.name)
    );
  }
  if (candidate.type === 'emoji') {
    return (
      typeof candidate.value === 'string' &&
      candidate.value.trim() === candidate.value &&
      candidate.value.length > 0 &&
      new TextEncoder().encode(candidate.value).length <= 64
    );
  }
  return (
    candidate.type === 'local' &&
    typeof candidate.assetId === 'string' &&
    candidate.assetId.length <= 128 &&
    /^[A-Za-z0-9._-]+$/u.test(candidate.assetId)
  );
}
