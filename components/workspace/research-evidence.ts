import { contentFingerprint, type ResearchEvidence } from './research-notes';
export function researchTerms(question: string): string[] {
  const latin = question.toLocaleLowerCase().match(/[a-z0-9_]{2,}/g) ?? [];
  const chinese = question.match(/[\p{Script=Han}]+/gu) ?? [];
  return [
    ...new Set([
      ...latin,
      ...chinese.flatMap((word) =>
        Array.from(word).flatMap((char, index, chars) =>
          index < chars.length - 1 ? [char + chars[index + 1]] : [],
        ),
      ),
    ]),
  ]
    .filter(
      (term) =>
        ![
          '什么',
          '如何',
          '我们',
          '目前',
          '是否',
          '进行',
          '可以',
          'the',
          'and',
          'with',
          'this',
          'that',
        ].includes(term),
    )
    .slice(0, 64);
}
export function selectEvidenceSpans(
  content: string,
  question: string,
  limit = 3,
) {
  const lines = content.split(/\r\n?|\n/);
  const terms = researchTerms(question);
  const candidates: Array<{
    line: number;
    endLine: number;
    excerpt: string;
    score: number;
  }> = [];
  let bodyStart = 0;
  if (lines[0]?.replace(/^\uFEFF/, '') === '---') {
    const end = lines.findIndex(
      (line, index) => index > 0 && (line === '---' || line === '...'),
    );
    if (end > 0) bodyStart = end + 1;
  }
  for (let start = bodyStart; start < lines.length; start += 8) {
    const excerpt = lines
      .slice(start, start + 12)
      .join('\n')
      .slice(0, 2400);
    if (!excerpt.trim()) continue;
    const lower = excerpt.toLocaleLowerCase();
    const matched = terms.filter((term) => lower.includes(term));
    const score =
      matched.length * 4 +
      matched.reduce(
        (sum, term) => sum + Math.min(lower.split(term).length - 1, 3),
        0,
      );
    candidates.push({
      line: start + 1,
      endLine: Math.min(start + 12, lines.length),
      excerpt,
      score,
    });
  }
  candidates.sort((a, b) => b.score - a.score || a.line - b.line);
  const selected: typeof candidates = [];
  for (const candidate of candidates) {
    if (selected.length >= Math.max(1, Math.min(limit, 3))) break;
    if (candidate.score === 0 && selected.length) continue;
    if (
      selected.some(
        (span) =>
          candidate.line <= span.endLine && candidate.endLine >= span.line,
      )
    )
      continue;
    selected.push(candidate);
  }
  return selected.sort((a, b) => a.line - b.line);
}
export async function createEvidenceRefs(
  relativePath: string,
  title: string,
  content: string,
  question: string,
): Promise<ResearchEvidence[]> {
  const fingerprint = await contentFingerprint(content);
  const capturedAt = new Date().toISOString();
  return Promise.all(
    selectEvidenceSpans(content, question).map(async (span) => ({
      ...span,
      relativePath,
      title,
      fingerprint,
      capturedAt,
      evidenceId: `${fingerprint.slice(0, 12)}:L${span.line}`,
      excerptFingerprint: await contentFingerprint(span.excerpt),
      retrieval:
        span.score > 0 ? ('keyword-match' as const) : ('no-match' as const),
    })),
  );
}
export function evidenceCitation(source: ResearchEvidence) {
  const path = source.relativePath.split('/').map(encodeURIComponent).join('/');
  return `[${source.title.replace(/[\[\]\\]/g, '')}](<${path}?v=${source.fingerprint}#L${source.line}>)`;
}
