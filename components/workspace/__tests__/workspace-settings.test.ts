import { describe, expect, it } from 'vitest';

import {
  DEFAULT_APP_SETTINGS,
  withDefaultAppSettings,
} from '../workspace-settings';

describe('workspace settings', () => {
  it('includes default font settings for UI, document and code text', () => {
    expect(DEFAULT_APP_SETTINGS.appearance.fonts).toEqual({
      code: 'JetBrains Mono',
      document: 'Songti SC',
      ui: 'SF Pro Text',
    });
  });

  it('normalizes legacy appearance settings with default fonts', () => {
    expect(
      withDefaultAppSettings({
        appearance: {
          pageWidthMode: 'standard',
        },
      }).appearance,
    ).toEqual({
      fonts: DEFAULT_APP_SETTINGS.appearance.fonts,
      pageWidthMode: 'standard',
    });
  });

  it('includes 1Code-style AI preference defaults', () => {
    expect(DEFAULT_APP_SETTINGS.ai).toMatchObject({
      customClaudeConfig: {
        baseUrl: '',
        model: '',
      },
      analyticsOptOut: false,
      autoAdvanceTarget: 'next',
      ctrlTabTarget: 'workspaces',
      defaultAgentMode: 'agent',
      desktopNotificationsEnabled: true,
      extendedThinkingEnabled: true,
      hiddenModelIds: ['gpt-5.1-codex-max', 'gpt-5.1-codex-mini'],
      includeCoAuthoredBy: true,
      lastSelectedCodexModelId: 'gpt-5.3-codex',
      lastSelectedCodexThinking: 'high',
      lastSelectedModelId: 'opus',
      notifyWhenFocused: false,
      preferredEditor: 'cursor',
      settingsSidebarWidths: {
        agents: 240,
        mcp: 240,
        plugins: 240,
        skills: 240,
      },
      soundNotificationsEnabled: true,
    });
  });

  it('normalizes legacy AI settings with 1Code-style AI preference defaults', () => {
    expect(
      withDefaultAppSettings({
        ai: {
          enabledProfileId: null,
          profiles: [],
        },
    }).ai,
    ).toMatchObject({
      customClaudeConfig: {
        baseUrl: '',
        model: '',
      },
      analyticsOptOut: false,
      autoAdvanceTarget: 'next',
      ctrlTabTarget: 'workspaces',
      defaultAgentMode: 'agent',
      desktopNotificationsEnabled: true,
      extendedThinkingEnabled: true,
      hiddenModelIds: ['gpt-5.1-codex-max', 'gpt-5.1-codex-mini'],
      includeCoAuthoredBy: true,
      lastSelectedCodexModelId: 'gpt-5.3-codex',
      lastSelectedCodexThinking: 'high',
      lastSelectedModelId: 'opus',
      notifyWhenFocused: false,
      preferredEditor: 'cursor',
      settingsSidebarWidths: {
        agents: 240,
        mcp: 240,
        plugins: 240,
        skills: 240,
      },
      soundNotificationsEnabled: true,
    });
  });

  it('normalizes 1Code-style AI settings sidebar widths within resize bounds', () => {
    expect(
      withDefaultAppSettings({
        ai: {
          settingsSidebarWidths: {
            agents: 120,
            mcp: 460,
            plugins: 300,
            skills: 280,
          },
        },
      }).ai.settingsSidebarWidths,
    ).toEqual({
      agents: 200,
      mcp: 400,
      plugins: 300,
      skills: 280,
    });
  });
});
