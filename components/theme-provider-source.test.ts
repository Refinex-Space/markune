import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const layoutPath = join(process.cwd(), 'app/layout.tsx');
const providerPath = join(process.cwd(), 'components/theme-provider.tsx');
const tauriConfigPath = join(process.cwd(), 'src-tauri/tauri.conf.json');
const tauriCapabilityPath = join(
  process.cwd(),
  'src-tauri/capabilities/default.json',
);
const tauriLibPath = join(process.cwd(), 'src-tauri/src/lib.rs');
const workspaceLayoutPath = join(
  process.cwd(),
  'components/workspace/workspace-layout.tsx',
);
const globalsCssPath = join(process.cwd(), 'app/globals.css');

describe('theme provider source contract', () => {
  it('configures next-themes to drive Tailwind dark classes without changing the default light theme', () => {
    const layoutSource = readFileSync(layoutPath, 'utf8');
    const providerSource = readFileSync(providerPath, 'utf8');
    const tauriCapability = JSON.parse(
      readFileSync(tauriCapabilityPath, 'utf8'),
    );
    const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'));
    const tauriLibSource = readFileSync(tauriLibPath, 'utf8');
    const workspaceLayoutSource = readFileSync(workspaceLayoutPath, 'utf8');

    expect(providerSource).toContain("from 'next-themes'");
    expect(providerSource).toContain('attribute="class"');
    expect(providerSource).toContain('defaultTheme="light"');
    expect(providerSource).toContain('enableSystem');
    expect(providerSource).toContain("import('@tauri-apps/api/window')");
    expect(providerSource).toContain('setBackgroundColor');
    expect(providerSource).toContain("window.requestAnimationFrame");
    expect(providerSource).toContain('[data-testid="workspace-shell"]');
    expect(providerSource).toContain('getComputedStyle');
    expect(providerSource).toContain('setBackgroundColor(backgroundColor)');
    expect(providerSource).toContain('parseCssColorToRgba');
    expect(providerSource).toContain('compositeColorOverAncestorBackground');
    expect(providerSource).toContain('compositeColor');
    expect(providerSource).toContain('await currentWindow.setTheme(windowTheme)');
    expect(providerSource).toContain(
      'await currentWindow.setBackgroundColor(backgroundColor)',
    );
    expect(providerSource).toContain('setTheme');
    expect(layoutSource).toContain('suppressHydrationWarning');
    expect(layoutSource).toContain('<ThemeProvider>');
    expect(tauriConfig.app.windows[0].titleBarStyle).toBe('Overlay');
    expect(tauriConfig.app.windows[0].hiddenTitle).toBe(true);
    expect(tauriConfig.app.windows[0].dragDropEnabled).toBe(false);
    expect(tauriCapability.permissions).toContain(
      'core:window:allow-start-dragging',
    );
    expect(tauriCapability.permissions).toContain(
      'core:window:allow-minimize',
    );
    expect(tauriCapability.permissions).toContain(
      'core:window:allow-toggle-maximize',
    );
    expect(tauriCapability.permissions).toContain('core:window:allow-close');
    expect(tauriCapability.permissions).not.toContain(
      'core:window:allow-destroy',
    );
    expect(tauriCapability.permissions).toContain('process:default');
    expect(tauriLibSource).toContain('cfg!(target_os = "windows")');
    expect(tauriLibSource).toContain('set_decorations(false)');
    expect(workspaceLayoutSource).toContain('data-tauri-drag-region="deep"');
    expect(workspaceLayoutSource).toContain(
      'workspace-titlebar-drag-region',
    );
    expect(workspaceLayoutSource).toContain('windows-titlebar-controls');
    expect(workspaceLayoutSource).toContain(
      'absolute inset-x-0 top-0 z-40 flex h-8 items-stretch',
    );
    expect(workspaceLayoutSource).not.toContain('flex h-10 shrink-0');
    expect(workspaceLayoutSource).toContain(
      "isTauriRuntime && isWindowsRuntime && 'pt-8'",
    );
    expect(workspaceLayoutSource).toContain(
      "'-mr-2 transition-opacity duration-300",
    );
    expect(workspaceLayoutSource).toContain(
      'className="relative m-2 flex min-h-0 min-w-0 max-w-full flex-1',
    );
    expect(workspaceLayoutSource).toContain('event.preventDefault();');
    expect(workspaceLayoutSource).toContain(
      "await import('@tauri-apps/plugin-process')",
    );
    expect(workspaceLayoutSource).toContain('await exit(0)');
    expect(workspaceLayoutSource).not.toContain('await appWindow.close()');
    expect(workspaceLayoutSource).not.toContain('await appWindow.destroy()');
  });

  it('keeps web and desktop app icons sourced from the Markune asset set', () => {
    const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'));
    const faviconPath = join(process.cwd(), 'app/favicon.ico');
    const tauriIcoPath = join(process.cwd(), 'src-tauri/icons/icon.ico');
    const markuneLogoPath = join(
      process.cwd(),
      'public/brand/markune-logo-dark-app.svg.svg',
    );

    const markuneLogoSource = readFileSync(markuneLogoPath, 'utf8');
    expect(markuneLogoSource).toContain('macOS-style white rounded-square app icon');
    expect(markuneLogoSource).toContain('id="tileFill"');
    expect(markuneLogoSource).toContain('id="markFill"');
    expect(Buffer.compare(readFileSync(faviconPath), readFileSync(tauriIcoPath))).toBe(
      0,
    );
    for (const iconPath of tauriConfig.bundle.icon as string[]) {
      expect(existsSync(join(process.cwd(), 'src-tauri', iconPath))).toBe(true);
    }
  });

  it('loads Geist fonts from local public assets instead of Google Fonts at runtime', () => {
    const layoutSource = readFileSync(layoutPath, 'utf8');
    const globalsSource = readFileSync(globalsCssPath, 'utf8');
    const localFontFiles = [
      'public/fonts/geist/geist-latin.woff2',
      'public/fonts/geist/geist-latin-ext.woff2',
      'public/fonts/geist-mono/geist-mono-latin.woff2',
      'public/fonts/geist-mono/geist-mono-latin-ext.woff2',
    ];

    expect(layoutSource).not.toContain('next/font/google');
    expect(layoutSource).not.toContain('Geist(');
    expect(layoutSource).not.toContain('Geist_Mono(');
    expect(globalsSource).toContain("font-family: 'Geist'");
    expect(globalsSource).toContain("font-family: 'Geist Mono'");
    expect(globalsSource).toContain("url('/fonts/geist/geist-latin.woff2')");
    expect(globalsSource).toContain(
      "url('/fonts/geist-mono/geist-mono-latin.woff2')",
    );
    for (const fontFile of localFontFiles) {
      expect(existsSync(join(process.cwd(), fontFile))).toBe(true);
    }
  });
});
