import { describe, expect, it, vi } from 'vitest';

import {
  createWorkspaceSettingsSessionCache,
  loadWorkspaceSettingsResource,
} from '../workspace-settings-cache';

describe('workspace settings session cache', () => {
  it('coalesces concurrent loads for the same resource', async () => {
    const cache = createWorkspaceSettingsSessionCache();
    let resolveLoad: (() => void) | undefined;
    const loader = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const first = loadWorkspaceSettingsResource(cache, '/repo:ai-mcp', loader);
    const second = loadWorkspaceSettingsResource(cache, '/repo:ai-mcp', loader);

    expect(first).toBe(second);
    expect(loader).toHaveBeenCalledTimes(1);

    resolveLoad?.();
    await first;

    expect(cache.inFlight.has('/repo:ai-mcp')).toBe(false);
  });
});
