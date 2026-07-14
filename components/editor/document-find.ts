export interface DocumentFindOptions {
  readonly caseSensitive: boolean;
  readonly regex: boolean;
  readonly wholeWord: boolean;
}

export interface DocumentTextMatch {
  readonly captures: readonly (string | undefined)[];
  readonly from: number;
  readonly groups: Readonly<Record<string, string>> | null;
  readonly input: string;
  readonly text: string;
  readonly to: number;
}

export interface DocumentTextFindResult {
  readonly error: string | null;
  readonly matches: readonly DocumentTextMatch[];
}

export const defaultDocumentFindOptions: DocumentFindOptions = {
  caseSensitive: false,
  regex: false,
  wholeWord: false,
};

const wordSegmenter =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'word' })
    : null;

export function findDocumentTextMatches(
  text: string,
  query: string,
  options: Partial<DocumentFindOptions> = {},
): DocumentTextFindResult {
  if (!query) {
    return { error: null, matches: [] };
  }

  const resolvedOptions = { ...defaultDocumentFindOptions, ...options };
  let matcher: RegExp;

  try {
    matcher = new RegExp(
      resolvedOptions.regex ? query : escapeRegExp(query),
      `gu${resolvedOptions.caseSensitive ? '' : 'i'}`,
    );
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : '无效的正则表达式',
      matches: [],
    };
  }

  const matches: DocumentTextMatch[] = [];
  let result: RegExpExecArray | null;

  while ((result = matcher.exec(text)) !== null) {
    if (result[0].length === 0) {
      matcher.lastIndex = advanceStringIndex(text, matcher.lastIndex);
      continue;
    }

    const from = result.index;
    const to = from + result[0].length;

    if (
      resolvedOptions.wholeWord &&
      !isWholeWordMatch(text, from, to)
    ) {
      continue;
    }

    matches.push({
      captures: result.slice(1),
      from,
      groups: result.groups ?? null,
      input: text,
      text: result[0],
      to,
    });
  }

  return { error: null, matches };
}

export function replaceDocumentTextMatch(
  text: string,
  match: DocumentTextMatch,
  replacement: string,
) {
  return `${text.slice(0, match.from)}${expandReplacement(
    replacement,
    match,
  )}${text.slice(match.to)}`;
}

export function replaceAllDocumentTextMatches(
  text: string,
  matches: readonly DocumentTextMatch[],
  replacement: string,
) {
  return matches
    .slice()
    .reverse()
    .reduce(
      (current, match) =>
        replaceDocumentTextMatch(current, match, replacement),
      text,
    );
}

function isWholeWordMatch(text: string, start: number, end: number) {
  if (wordSegmenter) {
    for (const segment of wordSegmenter.segment(text)) {
      if (segment.index > start) {
        return false;
      }

      if (segment.index === start) {
        return segment.isWordLike === true && start + segment.segment.length === end;
      }
    }

    return false;
  }

  return (
    !isWordCharacter(characterBefore(text, start)) &&
    !isWordCharacter(characterAfter(text, end))
  );
}

function characterBefore(text: string, index: number) {
  return Array.from(text.slice(Math.max(0, index - 2), index)).at(-1) ?? '';
}

function characterAfter(text: string, index: number) {
  return Array.from(text.slice(index, index + 2))[0] ?? '';
}

function isWordCharacter(value: string) {
  return value ? /[\p{L}\p{N}_]/u.test(value) : false;
}

function advanceStringIndex(text: string, index: number) {
  const codePoint = text.codePointAt(index);
  return index + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function expandReplacement(
  replacement: string,
  match: DocumentTextMatch,
) {
  return replacement.replace(
    /\$(\$|&|`|'|<([^>]+)>|(\d{1,2}))/g,
    (
      token,
      marker: string,
      groupName: string | undefined,
      groupIndex: string | undefined,
    ) => {
      if (marker === '$') return '$';
      if (marker === '&') return match.text;
      if (marker === '`') return match.input.slice(0, match.from);
      if (marker === "'") return match.input.slice(match.to);
      if (groupName !== undefined) return match.groups?.[groupName] ?? '';
      if (groupIndex !== undefined) {
        const capture = match.captures[Number(groupIndex) - 1];
        return capture === undefined ? token : capture;
      }
      return token;
    },
  );
}
