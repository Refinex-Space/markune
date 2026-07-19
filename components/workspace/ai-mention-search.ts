export interface MentionSearchDocument {
  absolutePath: string;
  id: string;
  name: string;
  relativePath: string;
  title?: string;
}

export interface MentionToken {
  end: number;
  query: string;
  start: number;
}

interface MentionSearchOptions {
  excludedPaths?: ReadonlySet<string>;
  limit?: number;
  preferredPath?: string | null;
}

interface NormalizedText {
  characters: string[];
  indices: number[];
}

interface TextMatch {
  indices: number[];
  score: number;
}

const DEFAULT_RESULT_LIMIT = 8;
const PREFERRED_DOCUMENT_BOOST = 5_000;

export function rankMentionDocuments<T extends MentionSearchDocument>(
  documents: readonly T[],
  query: string,
  options: MentionSearchOptions = {},
) {
  const excludedPaths = options.excludedPaths ?? new Set<string>();
  const limit = options.limit ?? DEFAULT_RESULT_LIMIT;
  const normalizedQuery = normalizeText(query.trim()).characters;
  const seen = new Set<string>();

  return documents
    .flatMap((document, order) => {
      if (
        seen.has(document.absolutePath) ||
        excludedPaths.has(document.absolutePath)
      ) {
        return [];
      }
      seen.add(document.absolutePath);

      const preferredBoost =
        document.absolutePath === options.preferredPath
          ? PREFERRED_DOCUMENT_BOOST
          : 0;

      if (normalizedQuery.length === 0) {
        return [{ document, order, score: preferredBoost }];
      }

      const fields = [
        { value: document.title ?? '', weight: 3_000 },
        { value: document.name, weight: 2_000 },
        { value: document.relativePath, weight: 1_000 },
      ];
      const score = fields.reduce<number | null>((best, field) => {
        const match = matchNormalizedText(field.value, normalizedQuery);
        const fieldScore = match ? match.score + field.weight : null;
        return fieldScore === null
          ? best
          : Math.max(best ?? Number.NEGATIVE_INFINITY, fieldScore);
      }, null);

      return score === null
        ? []
        : [{ document, order, score: score + preferredBoost }];
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        (normalizedQuery.length > 0
          ? compareStableText(
              left.document.relativePath,
              right.document.relativePath,
            )
          : left.order - right.order) ||
        left.order - right.order,
    )
    .slice(0, Math.max(0, limit))
    .map(({ document }) => document);
}

export function mentionMatchIndices(text: string, query: string) {
  const normalizedQuery = normalizeText(query.trim()).characters;
  if (normalizedQuery.length === 0) {
    return [];
  }
  return matchNormalizedText(text, normalizedQuery)?.indices ?? [];
}

export function findMentionToken(text: string, cursorOffset: number) {
  return findTriggeredToken(text, cursorOffset, '@');
}

export function findSkillToken(text: string, cursorOffset: number) {
  return findTriggeredToken(text, cursorOffset, '/');
}

function findTriggeredToken(
  text: string,
  cursorOffset: number,
  trigger: '@' | '/',
) {
  const cursor = Math.max(0, Math.min(cursorOffset, text.length));
  if (cursor > 0 && isTokenSeparator(text[cursor - 1])) {
    return null;
  }

  let start = cursor;
  while (start > 0 && !isTokenSeparator(text[start - 1])) {
    start -= 1;
  }

  let end = cursor;
  while (end < text.length && !isTokenSeparator(text[end])) {
    end += 1;
  }

  const token = text.slice(start, end);
  if (!token.startsWith(trigger)) {
    return null;
  }
  if (start > 0 && !isTokenSeparator(text[start - 1])) {
    return null;
  }

  return {
    end,
    query: token.slice(1),
    start,
  } satisfies MentionToken;
}

function matchNormalizedText(
  text: string,
  normalizedQuery: readonly string[],
) {
  const normalized = normalizeText(text);
  const exactIndex = findContiguousMatch(
    normalized.characters,
    normalizedQuery,
  );
  if (exactIndex >= 0) {
    const boundary =
      exactIndex === 0 ||
      isSearchBoundary(normalized.characters[exactIndex - 1]);
    const score =
      normalized.characters.length === normalizedQuery.length
        ? 100_000
        : exactIndex === 0
          ? 90_000
          : boundary
            ? 80_000 - exactIndex
            : 70_000 - exactIndex;
    return {
      indices: unique(
        normalized.indices.slice(
          exactIndex,
          exactIndex + normalizedQuery.length,
        ),
      ),
      score,
    } satisfies TextMatch;
  }

  const compactQuery = normalizedQuery.filter(
    (character) => !isSearchBoundary(character),
  );
  const compactText = compactNormalizedText(normalized);
  const compactIndex = findContiguousMatch(
    compactText.characters,
    compactQuery,
  );
  if (
    compactQuery.length > 0 &&
    compactIndex >= 0 &&
    (compactQuery.length !== normalizedQuery.length ||
      compactText.characters.length !== normalized.characters.length)
  ) {
    const normalizedStart = compactText.normalizedIndices[compactIndex] ?? 0;
    const boundary =
      normalizedStart === 0 ||
      isSearchBoundary(normalized.characters[normalizedStart - 1]);
    const score =
      compactText.characters.length === compactQuery.length
        ? 95_000
        : compactIndex === 0
          ? 85_000
          : boundary
            ? 75_000 - compactIndex
            : 65_000 - compactIndex;
    return {
      indices: unique(
        compactText.indices.slice(
          compactIndex,
          compactIndex + compactQuery.length,
        ),
      ),
      score,
    } satisfies TextMatch;
  }

  const matchedIndices: number[] = [];
  let queryIndex = 0;
  let firstIndex = -1;
  let previousIndex = -1;
  let gapCount = 0;

  for (
    let valueIndex = 0;
    valueIndex < normalized.characters.length &&
    queryIndex < normalizedQuery.length;
    valueIndex += 1
  ) {
    if (normalized.characters[valueIndex] !== normalizedQuery[queryIndex]) {
      continue;
    }
    if (firstIndex < 0) {
      firstIndex = valueIndex;
    } else {
      gapCount += Math.max(0, valueIndex - previousIndex - 1);
    }
    previousIndex = valueIndex;
    matchedIndices.push(normalized.indices[valueIndex]);
    queryIndex += 1;
  }

  if (queryIndex !== normalizedQuery.length) {
    return null;
  }

  const boundaryBonus =
    firstIndex === 0 ||
    isSearchBoundary(normalized.characters[firstIndex - 1])
      ? 1_000
      : 0;
  return {
    indices: unique(matchedIndices),
    score: 50_000 + boundaryBonus - gapCount * 20 - firstIndex * 5,
  } satisfies TextMatch;
}

function normalizeText(text: string): NormalizedText {
  const characters: string[] = [];
  const indices: number[] = [];

  Array.from(text).forEach((character, originalIndex) => {
    const normalized = character.normalize('NFKC').toLowerCase();
    Array.from(normalized).forEach((normalizedCharacter) => {
      characters.push(normalizedCharacter);
      indices.push(originalIndex);
    });
  });

  return { characters, indices };
}

function compactNormalizedText(normalized: NormalizedText) {
  const characters: string[] = [];
  const indices: number[] = [];
  const normalizedIndices: number[] = [];

  normalized.characters.forEach((character, normalizedIndex) => {
    if (isSearchBoundary(character)) return;
    characters.push(character);
    indices.push(normalized.indices[normalizedIndex]);
    normalizedIndices.push(normalizedIndex);
  });

  return { characters, indices, normalizedIndices };
}

function compareStableText(left: string, right: string) {
  const normalizedLeft = left.normalize('NFKC').toLowerCase();
  const normalizedRight = right.normalize('NFKC').toLowerCase();
  if (normalizedLeft === normalizedRight) {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  return normalizedLeft < normalizedRight ? -1 : 1;
}

function findContiguousMatch(
  value: readonly string[],
  query: readonly string[],
) {
  if (query.length === 0 || query.length > value.length) {
    return -1;
  }

  for (let start = 0; start <= value.length - query.length; start += 1) {
    if (query.every((character, index) => value[start + index] === character)) {
      return start;
    }
  }
  return -1;
}

function unique(values: readonly number[]) {
  return [...new Set(values)];
}

function isTokenSeparator(character: string | undefined) {
  return character === undefined || /\s/u.test(character);
}

function isSearchBoundary(character: string | undefined) {
  return character === undefined || /[\s/\\._\-()[\]{}]/u.test(character);
}
