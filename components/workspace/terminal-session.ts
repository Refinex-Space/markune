const DEFAULT_MAX_TERMINAL_INPUT_BYTES = 64 * 1024;

export interface TerminalTabIdentity {
  cwd: string;
  id: string;
}

export function retainTerminalTabs<T extends TerminalTabIdentity>(
  tabs: readonly T[],
  rootPath: string | null,
): { kept: T[]; stale: T[] } {
  if (!rootPath) {
    return { kept: [], stale: [...tabs] };
  }

  const kept: T[] = [];
  const stale: T[] = [];

  for (const tab of tabs) {
    if (tab.cwd === rootPath) {
      kept.push(tab);
    } else {
      stale.push(tab);
    }
  }

  return { kept, stale };
}

export function shouldAutoCreateTerminal(input: {
  isTauriRuntime: boolean;
  rootPath: string | null;
  tabCount: number;
  terminalOpen: boolean;
  userClosedLastTab: boolean;
}): boolean {
  return (
    input.terminalOpen &&
    input.tabCount === 0 &&
    Boolean(input.rootPath) &&
    input.isTauriRuntime &&
    !input.userClosedLastTab
  );
}

export function splitTerminalInput(
  data: string,
  maxBytes = DEFAULT_MAX_TERMINAL_INPUT_BYTES,
): string[] {
  if (!data) {
    return [];
  }

  if (maxBytes < 4) {
    throw new Error('终端输入分片过小');
  }

  const chunks: string[] = [];
  let start = 0;
  let bytes = 0;

  for (let index = 0; index < data.length; ) {
    const unit = utf16Unit(data, index);

    if (bytes > 0 && bytes + unit.bytes > maxBytes) {
      chunks.push(data.slice(start, index));
      start = index;
      bytes = 0;
    }

    if (unit.bytes > maxBytes) {
      chunks.push(data.slice(index, index + unit.units));
      start = index + unit.units;
      index = start;
      bytes = 0;
      continue;
    }

    bytes += unit.bytes;
    index += unit.units;
  }

  if (start < data.length) {
    chunks.push(data.slice(start));
  }

  return chunks;
}

export function isClosedTerminalSessionError(message: string) {
  return message.includes('终端会话不存在');
}

function utf16Unit(
  data: string,
  index: number,
): { bytes: number; units: number } {
  const code = data.charCodeAt(index);

  if (code >= 0xd800 && code <= 0xdbff && index + 1 < data.length) {
    const next = data.charCodeAt(index + 1);

    if (next >= 0xdc00 && next <= 0xdfff) {
      return { bytes: 4, units: 2 };
    }
  }

  if (code <= 0x7f) {
    return { bytes: 1, units: 1 };
  }

  if (code <= 0x7ff) {
    return { bytes: 2, units: 1 };
  }

  return { bytes: 3, units: 1 };
}
