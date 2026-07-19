import type { WorkspaceSearchResult } from './workspace-types';

export interface WorkspaceSearchDocument extends WorkspaceSearchResult {
  content: string;
  drawingId?: string;
  kind?: 'document' | 'drawing';
}

export interface TextHighlightRange {
  end: number;
  start: number;
}

export interface WorkspaceSearchSnippet {
  highlights: TextHighlightRange[];
  text: string;
}

export interface WorkspaceGlobalSearchResult {
  document: WorkspaceSearchDocument;
  pathHighlights: TextHighlightRange[];
  score: number;
  snippet: WorkspaceSearchSnippet | null;
  titleHighlights: TextHighlightRange[];
}

interface FieldTokenCounts {
  content: Map<string, number>;
  name: Map<string, number>;
  path: Map<string, number>;
  title: Map<string, number>;
}

interface IndexedWorkspaceSearchDocument {
  document: WorkspaceSearchDocument;
  fieldLengths: Record<SearchField, number>;
  normalized: Record<SearchField, string>;
  tokens: FieldTokenCounts;
}

export interface WorkspaceSearchIndex {
  documents: IndexedWorkspaceSearchDocument[];
  postings: Map<string, Map<number, Partial<Record<SearchField, number>>>>;
}

type SearchField = 'content' | 'name' | 'path' | 'title';

const FIELD_WEIGHTS: Record<SearchField, number> = {
  content: 3,
  name: 18,
  path: 10,
  title: 26,
};

const FIELD_ORDER: SearchField[] = ['title', 'name', 'path', 'content'];
const MAX_RESULTS = 20;
const SNIPPET_RADIUS = 42;

export function buildWorkspaceSearchIndex(
  documents: WorkspaceSearchDocument[],
): WorkspaceSearchIndex {
  const indexedDocuments = documents.map(indexDocument);
  const postings = new Map<
    string,
    Map<number, Partial<Record<SearchField, number>>>
  >();

  indexedDocuments.forEach((document, documentIndex) => {
    FIELD_ORDER.forEach((field) => {
      document.tokens[field].forEach((count, token) => {
        let tokenPostings = postings.get(token);

        if (!tokenPostings) {
          tokenPostings = new Map();
          postings.set(token, tokenPostings);
        }

        const entry = tokenPostings.get(documentIndex) ?? {};
        entry[field] = count;
        tokenPostings.set(documentIndex, entry);
      });
    });
  });

  return { documents: indexedDocuments, postings };
}

export function searchWorkspaceIndex(
  index: WorkspaceSearchIndex,
  query: string,
  limit = MAX_RESULTS,
): WorkspaceGlobalSearchResult[] {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return [];
  }

  const queryTokens = Array.from(new Set(tokenize(normalizedQuery)));
  const candidateIndexes = collectCandidateIndexes(index, queryTokens);

  if (candidateIndexes.size === 0) {
    collectSubstringCandidates(index, normalizedQuery, candidateIndexes);
  }

  return Array.from(candidateIndexes)
    .map((documentIndex) =>
      scoreDocument(index, documentIndex, normalizedQuery, queryTokens),
    )
    .filter((result): result is WorkspaceGlobalSearchResult => result !== null)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function indexDocument(
  document: WorkspaceSearchDocument,
): IndexedWorkspaceSearchDocument {
  const normalized = {
    content: normalizeText(document.content),
    name: normalizeText(document.name),
    path: normalizeText(document.relativePath),
    title: normalizeText(document.title),
  };

  const tokens = {
    content: countTokens(tokenize(normalized.content)),
    name: countTokens(tokenize(normalized.name)),
    path: countTokens(tokenize(normalized.path)),
    title: countTokens(tokenize(normalized.title)),
  };

  return {
    document,
    fieldLengths: {
      content: Math.max(1, totalTokenCount(tokens.content)),
      name: Math.max(1, totalTokenCount(tokens.name)),
      path: Math.max(1, totalTokenCount(tokens.path)),
      title: Math.max(1, totalTokenCount(tokens.title)),
    },
    normalized,
    tokens,
  };
}

function collectCandidateIndexes(
  index: WorkspaceSearchIndex,
  queryTokens: string[],
) {
  const candidates = new Set<number>();

  queryTokens.forEach((token) => {
    index.postings.get(token)?.forEach((_, documentIndex) => {
      candidates.add(documentIndex);
    });
  });

  return candidates;
}

function collectSubstringCandidates(
  index: WorkspaceSearchIndex,
  normalizedQuery: string,
  candidates: Set<number>,
) {
  index.documents.forEach((document, documentIndex) => {
    if (FIELD_ORDER.some((field) => document.normalized[field].includes(normalizedQuery))) {
      candidates.add(documentIndex);
    }
  });
}

function scoreDocument(
  index: WorkspaceSearchIndex,
  documentIndex: number,
  normalizedQuery: string,
  queryTokens: string[],
): WorkspaceGlobalSearchResult | null {
  const document = index.documents[documentIndex];
  let score = 0;

  queryTokens.forEach((token) => {
    const tokenPostings = index.postings.get(token);
    const documentPosting = tokenPostings?.get(documentIndex);

    if (!documentPosting || !tokenPostings) {
      return;
    }

    const idf = Math.log(1 + index.documents.length / (tokenPostings.size + 1));

    FIELD_ORDER.forEach((field) => {
      const count = documentPosting[field] ?? 0;

      if (count === 0) {
        return;
      }

      const tf = 1 + Math.log(count);
      const lengthPenalty = Math.sqrt(document.fieldLengths[field]);
      score += (FIELD_WEIGHTS[field] * tf * idf) / lengthPenalty;
    });
  });

  score += scoreContinuousMatch(document, normalizedQuery);

  if (score <= 0) {
    return null;
  }

  return {
    document: document.document,
    pathHighlights: getHighlights(document.document.relativePath, normalizedQuery),
    score,
    snippet: createSnippet(document.document.content, normalizedQuery, queryTokens),
    titleHighlights: getHighlights(document.document.title, normalizedQuery),
  };
}

function scoreContinuousMatch(
  document: IndexedWorkspaceSearchDocument,
  normalizedQuery: string,
) {
  let score = 0;

  FIELD_ORDER.forEach((field) => {
    const value = document.normalized[field];

    if (!value) {
      return;
    }

    if (value === normalizedQuery) {
      score += FIELD_WEIGHTS[field] * 35;
    } else if (value.startsWith(normalizedQuery)) {
      score += FIELD_WEIGHTS[field] * 22;
    } else if (value.includes(normalizedQuery)) {
      score += FIELD_WEIGHTS[field] * 12;
    }
  });

  return score;
}

function createSnippet(
  content: string,
  normalizedQuery: string,
  queryTokens: string[],
): WorkspaceSearchSnippet | null {
  const normalizedContent = normalizeText(content);
  const matchIndex = findBestMatchIndex(
    normalizedContent,
    normalizedQuery,
    queryTokens,
  );

  if (matchIndex === -1) {
    return null;
  }

  const start = Math.max(0, matchIndex - SNIPPET_RADIUS);
  const end = Math.min(
    content.length,
    matchIndex + normalizedQuery.length + SNIPPET_RADIUS,
  );
  const prefix = start > 0 ? '...' : '';
  const suffix = end < content.length ? '...' : '';
  const text = `${prefix}${content.slice(start, end)}${suffix}`;
  const highlights = getHighlights(text, normalizedQuery, queryTokens);

  return { highlights, text };
}

function findBestMatchIndex(
  normalizedContent: string,
  normalizedQuery: string,
  queryTokens: string[],
) {
  const queryIndex = normalizedContent.indexOf(normalizedQuery);

  if (queryIndex !== -1) {
    return queryIndex;
  }

  return queryTokens.reduce((bestIndex, token) => {
    const tokenIndex = normalizedContent.indexOf(token);

    if (tokenIndex === -1) {
      return bestIndex;
    }

    return bestIndex === -1 ? tokenIndex : Math.min(bestIndex, tokenIndex);
  }, -1);
}

function getHighlights(
  text: string,
  normalizedQuery: string,
  queryTokens = tokenize(normalizedQuery),
): TextHighlightRange[] {
  const normalizedText = normalizeText(text);
  const ranges: TextHighlightRange[] = [];

  appendRangeMatches(ranges, normalizedText, normalizedQuery);

  if (ranges.length === 0) {
    queryTokens.forEach((token) => appendRangeMatches(ranges, normalizedText, token));
  }

  return mergeRanges(ranges);
}

function appendRangeMatches(
  ranges: TextHighlightRange[],
  normalizedText: string,
  needle: string,
) {
  if (!needle) {
    return;
  }

  let index = normalizedText.indexOf(needle);

  while (index !== -1) {
    ranges.push({ end: index + needle.length, start: index });
    index = normalizedText.indexOf(needle, index + needle.length);
  }
}

function mergeRanges(ranges: TextHighlightRange[]) {
  return ranges
    .sort((left, right) => left.start - right.start)
    .reduce<TextHighlightRange[]>((merged, range) => {
      const previous = merged[merged.length - 1];

      if (!previous || range.start > previous.end) {
        merged.push({ ...range });
        return merged;
      }

      previous.end = Math.max(previous.end, range.end);
      return merged;
    }, []);
}

function countTokens(tokens: string[]) {
  return tokens.reduce((counts, token) => {
    counts.set(token, (counts.get(token) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
}

function totalTokenCount(counts: Map<string, number>) {
  return Array.from(counts.values()).reduce((total, count) => total + count, 0);
}

function tokenize(text: string) {
  const normalizedText = normalizeText(text);
  const tokens: string[] = [];

  normalizedText.match(/[a-z0-9]+/gu)?.forEach((token) => {
    tokens.push(token);
  });

  const cjkChars = Array.from(normalizedText).filter(isCjkCharacter);

  cjkChars.forEach((char, index) => {
    tokens.push(char);

    if (index > 0) {
      tokens.push(`${cjkChars[index - 1]}${char}`);
    }
  });

  return tokens.filter(Boolean);
}

function normalizeText(text: string) {
  return text.normalize('NFKC').toLowerCase().trim();
}

function isCjkCharacter(char: string) {
  return /\p{Script=Han}/u.test(char);
}
