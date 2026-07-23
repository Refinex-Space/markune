'use client';

const WORKSPACE_PERFORMANCE_STORAGE_KEY = 'madora:perf-log';

export interface WorkspacePerformanceMeasure {
  finish: (details?: Record<string, number | string>) => void;
  finishNextFrame: (details?: Record<string, number | string>) => void;
}

export interface WorkspacePerformanceReport {
  readonly counters: Record<string, number>;
  readonly measures: readonly WorkspacePerformanceEntry[];
  readonly startedAt: string;
  readonly version: 1;
}

export interface WorkspacePerformanceEntry {
  readonly details?: Record<string, number | string>;
  readonly durationMs: number;
  readonly label: string;
  readonly timestampMs: number;
}

const report: {
  counters: Record<string, number>;
  measures: WorkspacePerformanceEntry[];
  startedAt: string;
  version: 1;
} = {
  counters: {},
  measures: [],
  startedAt: new Date().toISOString(),
  version: 1,
};
const MAX_PERFORMANCE_ENTRIES = 2_000;

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
      finishNextFrame() {},
    };
  }

  const startedAt = performance.now();

  return {
    finish(details) {
      const elapsedMs = Math.round((performance.now() - startedAt) * 10) / 10;
      recordWorkspacePerformanceEntry(label, elapsedMs, details);
      const message = `[madora:perf] ${label} ${elapsedMs}ms`;

      if (details) {
        console.debug(message, details);
      } else {
        console.debug(message);
      }
    },
    finishNextFrame(details) {
      window.requestAnimationFrame(() => {
        const elapsedMs = Math.round((performance.now() - startedAt) * 10) / 10;
        recordWorkspacePerformanceEntry(`${label}.next_frame`, elapsedMs, details);
        const message = `[madora:perf] ${label}.next_frame ${elapsedMs}ms`;

        if (details) {
          console.debug(message, details);
        } else {
          console.debug(message);
        }
      });
    },
  };
}

export function incrementWorkspacePerformanceCounter(
  label: string,
  amount = 1,
  enabled = isWorkspacePerformanceLoggingEnabled(),
) {
  if (!enabled) {
    return;
  }

  report.counters[label] = (report.counters[label] ?? 0) + amount;
}

export function getWorkspacePerformanceReport(): WorkspacePerformanceReport {
  return {
    counters: { ...report.counters },
    measures: report.measures.map((entry) => ({
      ...entry,
      details: entry.details ? { ...entry.details } : undefined,
    })),
    startedAt: report.startedAt,
    version: report.version,
  };
}

export function observeWorkspaceLongTasks(
  enabled = isWorkspacePerformanceLoggingEnabled(),
) {
  if (
    !enabled ||
    typeof window === 'undefined' ||
    typeof PerformanceObserver === 'undefined'
  ) {
    return () => {};
  }

  const observer = new PerformanceObserver((entries) => {
    entries.getEntries().forEach((entry) => {
      console.debug(
        `[madora:perf] workspace.long_task ${Math.round(entry.duration * 10) / 10}ms`,
      );
      recordWorkspacePerformanceEntry(
        'workspace.long_task',
        Math.round(entry.duration * 10) / 10,
      );
    });
  });

  try {
    observer.observe({ buffered: true, type: 'longtask' });
    return () => observer.disconnect();
  } catch {
    observer.disconnect();
    return () => {};
  }
}

function recordWorkspacePerformanceEntry(
  label: string,
  durationMs: number,
  details?: Record<string, number | string>,
) {
  report.measures.push({
    details,
    durationMs,
    label,
    timestampMs:
      typeof performance === 'undefined' ? Date.now() : performance.now(),
  });
  if (report.measures.length > MAX_PERFORMANCE_ENTRIES) {
    report.measures.splice(0, report.measures.length - MAX_PERFORMANCE_ENTRIES);
  }

  if (typeof window !== 'undefined') {
    Object.defineProperty(window, '__MadoraPerformanceReport', {
      configurable: true,
      value: getWorkspacePerformanceReport,
    });
  }
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
