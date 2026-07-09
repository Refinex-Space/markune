'use client';

const WORKSPACE_PERFORMANCE_STORAGE_KEY = 'madora:perf-log';

export interface WorkspacePerformanceMeasure {
  finish: (details?: Record<string, number | string>) => void;
}

export function isWorkspacePerformanceLoggingEnabled(
  storageValue = readWorkspacePerformanceStorageValue(),
  search = readWorkspacePerformanceSearch(),
) {
  return storageValue === '1' || new URLSearchParams(search).get('madoraPerf') === '1';
}

export function startWorkspacePerformanceMeasure(
  label: string,
  enabled = isWorkspacePerformanceLoggingEnabled(),
): WorkspacePerformanceMeasure {
  if (!enabled) {
    return {
      finish() {},
    };
  }

  const startedAt = performance.now();

  return {
    finish(details) {
      const elapsedMs = Math.round((performance.now() - startedAt) * 10) / 10;
      const message = `[madora:perf] ${label} ${elapsedMs}ms`;

      if (details) {
        console.debug(message, details);
      } else {
        console.debug(message);
      }
    },
  };
}

function readWorkspacePerformanceStorageValue() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(WORKSPACE_PERFORMANCE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readWorkspacePerformanceSearch() {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.location.search;
}
