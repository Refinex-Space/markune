const LEGACY_STORAGE_PREFIX = 'madora:';
const CURRENT_STORAGE_PREFIX = 'markune:';

export function migrateLegacyBrowserStorage() {
  if (typeof window === 'undefined') {
    return;
  }

  const legacyKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(LEGACY_STORAGE_PREFIX)) {
      legacyKeys.push(key);
    }
  }

  for (const legacyKey of legacyKeys) {
    const currentKey = `${CURRENT_STORAGE_PREFIX}${legacyKey.slice(LEGACY_STORAGE_PREFIX.length)}`;
    if (window.localStorage.getItem(currentKey) !== null) {
      continue;
    }
    const value = window.localStorage.getItem(legacyKey);
    if (value === null) {
      continue;
    }
    try {
      window.localStorage.setItem(currentKey, value);
      window.localStorage.removeItem(legacyKey);
    } catch {
      // Keep the legacy value when the current WebView storage is unavailable.
    }
  }
}
