import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const workspaceApi = vi.hoisted(() => ({
  getMacosTitlebarMetrics: vi.fn(),
}));

vi.mock('../workspace-api', () => workspaceApi);

import {
  MAC_CHROME_CONTROLS_FALLBACK_TOP,
  useMacosChromeControlsTop,
} from '../use-macos-titlebar-metrics';

describe('useMacosChromeControlsTop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  it('centers the 32px web controls on the measured native traffic light', async () => {
    workspaceApi.getMacosTitlebarMetrics.mockResolvedValue({
      trafficLightCenterY: 39,
    });

    const { result } = renderHook(() => useMacosChromeControlsTop(true));

    expect(result.current).toBe(MAC_CHROME_CONTROLS_FALLBACK_TOP);
    await waitFor(() => expect(result.current).toBe(23));
  });

  it('remeasures after the window geometry changes', async () => {
    workspaceApi.getMacosTitlebarMetrics
      .mockResolvedValueOnce({ trafficLightCenterY: 39 })
      .mockResolvedValueOnce({ trafficLightCenterY: 43 });

    const { result } = renderHook(() => useMacosChromeControlsTop(true));
    await waitFor(() => expect(result.current).toBe(23));

    act(() => window.dispatchEvent(new Event('resize')));

    await waitFor(() => expect(result.current).toBe(27));
  });

  it('ignores an older measurement that resolves after a resize', async () => {
    let resolveInitial: ((value: { trafficLightCenterY: number }) => void) | null =
      null;
    workspaceApi.getMacosTitlebarMetrics
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveInitial = resolve;
          }),
      )
      .mockResolvedValueOnce({ trafficLightCenterY: 43 });

    const { result } = renderHook(() => useMacosChromeControlsTop(true));
    act(() => window.dispatchEvent(new Event('resize')));
    await waitFor(() => expect(result.current).toBe(27));

    await act(async () => {
      resolveInitial?.({ trafficLightCenterY: 39 });
    });

    expect(result.current).toBe(27);
  });

  it('keeps the safe fallback outside macOS Tauri or when measurement fails', async () => {
    workspaceApi.getMacosTitlebarMetrics.mockRejectedValue(
      new Error('native metrics unavailable'),
    );

    const disabled = renderHook(() => useMacosChromeControlsTop(false));
    expect(disabled.result.current).toBe(MAC_CHROME_CONTROLS_FALLBACK_TOP);
    expect(workspaceApi.getMacosTitlebarMetrics).not.toHaveBeenCalled();

    const enabled = renderHook(() => useMacosChromeControlsTop(true));
    await waitFor(() =>
      expect(enabled.result.current).toBe(MAC_CHROME_CONTROLS_FALLBACK_TOP),
    );
  });
});
