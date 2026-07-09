import { describe, expect, it, vi } from 'vitest';

import {
  isWorkspacePerformanceLoggingEnabled,
  startWorkspacePerformanceMeasure,
} from '../workspace-performance';

describe('workspace performance diagnostics', () => {
  it('stays disabled by default', () => {
    expect(isWorkspacePerformanceLoggingEnabled(null, '')).toBe(false);
  });

  it('can be enabled from storage or query string', () => {
    expect(isWorkspacePerformanceLoggingEnabled('1', '')).toBe(true);
    expect(isWorkspacePerformanceLoggingEnabled(null, '?madoraPerf=1')).toBe(true);
  });

  it('logs elapsed time only when enabled', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});

    startWorkspacePerformanceMeasure('workspace.test', false).finish();
    expect(debug).not.toHaveBeenCalled();

    startWorkspacePerformanceMeasure('workspace.test', true).finish({
      documents: 2,
    });
    expect(debug).toHaveBeenCalledWith(
      expect.stringContaining('[madora:perf] workspace.test'),
      { documents: 2 },
    );

    debug.mockRestore();
  });
});
