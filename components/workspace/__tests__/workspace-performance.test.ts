import { describe, expect, it, vi } from 'vitest';

import {
  getWorkspacePerformanceReport,
  incrementWorkspacePerformanceCounter,
  isWorkspacePerformanceLoggingEnabled,
  observeWorkspaceLongTasks,
  startWorkspacePerformanceMeasure,
} from '../workspace-performance';

describe('workspace performance diagnostics', () => {
  it('stays disabled by default', () => {
    expect(isWorkspacePerformanceLoggingEnabled(null, '')).toBe(false);
  });

  it('can be enabled from storage or query string', () => {
    expect(isWorkspacePerformanceLoggingEnabled('1', '')).toBe(true);
    expect(isWorkspacePerformanceLoggingEnabled(null, '?markunePerf=1')).toBe(true);
  });

  it('logs elapsed time only when enabled', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});

    startWorkspacePerformanceMeasure('workspace.test', false).finish();
    expect(debug).not.toHaveBeenCalled();

    startWorkspacePerformanceMeasure('workspace.test', true).finish({
      documents: 2,
    });
    expect(debug).toHaveBeenCalledWith(
      expect.stringContaining('[markune:perf] workspace.test'),
      { documents: 2 },
    );

    debug.mockRestore();
  });

  it('does not observe long tasks when diagnostics are disabled', () => {
    const disconnect = observeWorkspaceLongTasks(false);

    disconnect();
  });

  it('exposes a content-free JSON performance report when enabled', () => {
    incrementWorkspacePerformanceCounter('workspace.test.ipc', 1, true);
    startWorkspacePerformanceMeasure('workspace.test.report', true).finish({
      characters: 250_000,
    });

    const report = getWorkspacePerformanceReport();
    expect(report.version).toBe(1);
    expect(report.counters['workspace.test.ipc']).toBeGreaterThanOrEqual(1);
    expect(report.measures).toContainEqual(
      expect.objectContaining({
        details: { characters: 250_000 },
        label: 'workspace.test.report',
      }),
    );
  });
});
