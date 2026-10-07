import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionConfigOption } from '@agentclientprotocol/sdk';
import {
  AgentConfigToolbar,
  fastModeState,
  inlineAgentControls,
} from '../agent-config-toolbar';
const options: SessionConfigOption[] = [
  {
    id: 'mode',
    name: 'Mode',
    category: 'mode',
    type: 'select',
    currentValue: 'agent',
    options: [
      { value: 'agent', name: 'Auto review' },
      { value: 'read', name: 'Read-only' },
    ],
  },
  {
    id: 'collaboration_mode',
    name: 'Collaboration mode',
    category: 'collaboration_mode',
    type: 'select',
    currentValue: 'default',
    options: [
      { value: 'default', name: 'Default' },
      { value: 'plan', name: 'Plan' },
    ],
  },
  {
    id: 'model',
    name: 'Model',
    category: 'model',
    type: 'select',
    currentValue: 'astra',
    options: [{ value: 'astra', name: '6 Astra' }],
  },
  {
    id: 'reasoning_effort',
    name: 'Reasoning effort',
    category: 'thought_level',
    type: 'select',
    currentValue: 'xhigh',
    options: [{ value: 'xhigh', name: 'Xhigh' }],
  },
  {
    id: 'fast-mode',
    name: 'Fast mode',
    category: 'model_config',
    type: 'boolean',
    currentValue: false,
    description: 'Increased usage',
  },
  {
    id: 'future-setting',
    name: '未来扩展',
    type: 'boolean',
    currentValue: false,
  },
];
let resize: (() => void) | undefined;
let width = 480;
beforeEach(() => {
  width = 480;
  resize = undefined;
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({
      width,
      height: 28,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: 28,
      toJSON: () => ({}),
    }),
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const props = {
  agentId: 'codex-acp',
  options,
  modes: null,
  phase: 'ready' as const,
  usage: null,
  disabled: false,
  onConfigure: vi.fn(async () => {}),
  onMode: vi.fn(async () => {}),
};
describe('compact agent controls', () => {
  it('retains primary controls at narrow widths and exposes more controls when space permits', () => {
    expect(inlineAgentControls(options, 220, true)).toEqual(['model']);
    expect(inlineAgentControls(options, 480, true)).toEqual([
      'model',
      'mode',
      'reasoning_effort',
      'collaboration_mode',
    ]);
  });
  it('does not infer fast mode for unknown agents or unfamiliar option values', () => {
    expect(fastModeState('custom', options[4])).toBeNull();
    expect(
      fastModeState('codex-acp', {
        id: 'fast-mode',
        name: 'Fast',
        type: 'select',
        currentValue: 'turbo',
        options: [{ value: 'turbo', name: 'Turbo' }],
      }),
    ).toBeNull();
    expect(
      fastModeState('codex-acp', {
        id: 'fast-mode',
        name: 'Fast',
        type: 'select',
        currentValue: 'off',
        options: [
          { value: 'off', name: 'Off' },
          { value: 'on', name: 'On' },
        ],
      }),
    ).toEqual({ enabled: false, next: 'on' });
  });
  it('waits for the provider state before lighting the fast toggle and prevents repeated requests', async () => {
    let complete!: () => void;
    const configure = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const user = userEvent.setup();
    const { rerender } = render(
      <AgentConfigToolbar {...props} onConfigure={configure} />,
    );
    const toggle = screen.getByRole('button', { name: 'Fast mode' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await user.click(toggle);
    expect(configure).toHaveBeenCalledWith('fast-mode', true);
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await act(async () => complete());
    rerender(
      <AgentConfigToolbar
        {...props}
        options={options.map((option) =>
          option.id === 'fast-mode'
            ? ({ ...option, currentValue: true } as SessionConfigOption)
            : option,
        )}
        onConfigure={configure}
      />,
    );
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(configure).toHaveBeenCalledTimes(1);
  });
  it('keeps every option including unknown extensions editable in the overflow panel after resizing', async () => {
    const configure = vi.fn(async () => {});
    const user = userEvent.setup();
    render(<AgentConfigToolbar {...props} onConfigure={configure} />);
    await act(async () => {
      width = 280;
      resize?.();
    });
    expect(
      screen.queryByRole('combobox', { name: 'Collaboration mode' }),
    ).toBeNull();
    await user.click(screen.getByRole('button', { name: '更多会话设置' }));
    const settings = screen.getByRole('dialog', { name: '会话设置' });
    expect(
      within(settings).getByRole('combobox', { name: 'Collaboration mode' }),
    ).toBeTruthy();
    await user.click(
      within(settings).getByRole('button', { name: '未来扩展' }),
    );
    expect(configure).toHaveBeenCalledWith('future-setting', true);
  });
});
