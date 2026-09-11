export interface SourceChange {
  from: number;
  to: number;
  insert: string;
}

export function sourceOffsetMap(raw: string) {
  const lines = [{ raw: 0, editor: 0 }];
  let extra = 0;
  for (const match of raw.matchAll(/\r\n?|\n/g)) {
    extra += match[0].length - 1;
    const end = match.index! + match[0].length;
    lines.push({ raw: end, editor: end - extra });
  }
  const map = (
    position: number,
    from: 'raw' | 'editor',
    to: 'raw' | 'editor',
  ) => {
    let low = 0;
    let high = lines.length;
    while (low + 1 < high) {
      const middle = (low + high) >>> 1;
      if (lines[middle][from] <= position) low = middle;
      else high = middle;
    }
    return position + lines[low][to] - lines[low][from];
  };
  return {
    toRaw: (position: number) => map(position, 'editor', 'raw'),
    toEditor: (position: number) => map(position, 'raw', 'editor'),
  };
}

// CodeMirror normalizes line breaks; preserve untouched source bytes when applying its edits. author: refinex
export function applySourceChanges(raw: string, changes: SourceChange[]) {
  const offsets = sourceOffsetMap(raw);
  const edits = changes.map((change) => {
    const from = offsets.toRaw(change.from);
    const to = offsets.toRaw(change.to);
    const eol =
      /\r\n?|\n/.exec(raw.slice(from))?.[0] ??
      /\r\n?|\n/.exec(raw)?.[0] ??
      '\n';
    return { from, to, insert: change.insert.replace(/\r\n?|\n/g, eol) };
  });
  for (const edit of edits.sort((a, b) => b.from - a.from))
    raw = raw.slice(0, edit.from) + edit.insert + raw.slice(edit.to);
  return raw;
}
