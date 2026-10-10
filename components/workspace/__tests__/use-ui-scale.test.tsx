import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ setAppUiScale: vi.fn() }));
const notify = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('../workspace-api', () => api);
vi.mock('sonner', () => ({ toast: notify }));
import { useUiScale } from '../use-ui-scale';

describe('useUiScale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.setAppUiScale.mockResolvedValue(undefined);
  });

  it('restores native scale and keeps browser CSS zoom out of desktop rendering', async () => {
    const view = renderHook(() => useUiScale(90, true));
    await waitFor(() => expect(view.result.current).toBe(90));
    expect(api.setAppUiScale).toHaveBeenCalledWith(90);
    expect(document.documentElement.style.zoom).toBe('');
    expect(document.documentElement.style.getPropertyValue('--app-ui-scale')).toBe('0.9');
    view.unmount();
  });

  it('serializes native changes and skips superseded queued values', async () => {
    let resolve!: () => void;
    api.setAppUiScale.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }));
    const view = renderHook(({ scale }) => useUiScale(scale, true), { initialProps: { scale: 80 } });
    await waitFor(() => expect(api.setAppUiScale).toHaveBeenCalledWith(80));
    view.rerender({ scale: 125 });
    view.rerender({ scale: 100 });
    await act(async () => resolve());
    await waitFor(() => expect(api.setAppUiScale).toHaveBeenLastCalledWith(100));
    expect(api.setAppUiScale).toHaveBeenCalledTimes(2);
    expect(view.result.current).toBe(100);
    view.unmount();
  });

  it('retains the applied scale and reports native failures', async () => {
    const view = renderHook(({ scale }) => useUiScale(scale, true), { initialProps: { scale: 90 } });
    await waitFor(() => expect(view.result.current).toBe(90));
    api.setAppUiScale.mockRejectedValueOnce(new Error('unavailable'));
    view.rerender({ scale: 80 });
    await waitFor(() => expect(notify.error).toHaveBeenCalled());
    expect(view.result.current).toBe(90);
    view.unmount();
  });

  it('previews browser scaling and resets it when leaving the workspace', async () => {
    const view = renderHook(() => useUiScale(80, false));
    await waitFor(() => expect(view.result.current).toBe(80));
    expect(document.documentElement.style.zoom).toBe('0.8');
    expect(api.setAppUiScale).not.toHaveBeenCalled();
    view.unmount();
    expect(document.documentElement.style.zoom).toBe('');
  });
});
