// @author refinex
// 行级 LCS diff 算法：基于最长公共子序列计算 added/removed/context 行。
// 用于 AiEditTool 的内嵌 diff 视图（Edit/Write 工具卡）。

export type DiffLineType = 'added' | 'removed' | 'context';

export interface DiffLine {
  type: DiffLineType;
  oldNumber: number | null;
  newNumber: number | null;
  content: string;
}

const MAX_LCS_MATRIX_CELLS = 250_000;
const MAX_SUMMARY_CONTEXT_LINES = 48;

function splitLines(text: string): string[] {
  if (text === '') return [];
  return text.split('\n');
}

/** 计算两段文本的行级 diff（LCS 动态规划）。 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const n = oldLines.length;
  const m = newLines.length;

  if (n === 0 && m === 0) return [];

  if (n * m > MAX_LCS_MATRIX_CELLS) {
    return computeLargeTextDiff(oldLines, newLines);
  }

  // LCS 表
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // 回溯生成 diff
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let oldNum = 0;
  let newNum = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      oldNum++;
      newNum++;
      result.push({ type: 'context', oldNumber: oldNum, newNumber: newNum, content: oldLines[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      oldNum++;
      result.push({ type: 'removed', oldNumber: oldNum, newNumber: null, content: oldLines[i] });
      i++;
    } else {
      newNum++;
      result.push({ type: 'added', oldNumber: null, newNumber: newNum, content: newLines[j] });
      j++;
    }
  }
  while (i < n) {
    oldNum++;
    result.push({ type: 'removed', oldNumber: oldNum, newNumber: null, content: oldLines[i] });
    i++;
  }
  while (j < m) {
    newNum++;
    result.push({ type: 'added', oldNumber: null, newNumber: newNum, content: newLines[j] });
    j++;
  }

  return result;
}

function computeLargeTextDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  let prefixLength = 0;
  const sharedLength = Math.min(oldLines.length, newLines.length);

  while (
    prefixLength < sharedLength &&
    oldLines[prefixLength] === newLines[prefixLength]
  ) {
    prefixLength++;
  }

  let suffixLength = 0;
  while (
    suffixLength < sharedLength - prefixLength &&
    oldLines[oldLines.length - suffixLength - 1] ===
      newLines[newLines.length - suffixLength - 1]
  ) {
    suffixLength++;
  }

  const result: DiffLine[] = [];
  appendContext(result, oldLines.slice(0, prefixLength), 0, 0, 'before');
  oldLines
    .slice(prefixLength, oldLines.length - suffixLength)
    .forEach((content, index) => {
      result.push({
        content,
        newNumber: null,
        oldNumber: prefixLength + index + 1,
        type: 'removed',
      });
    });
  newLines
    .slice(prefixLength, newLines.length - suffixLength)
    .forEach((content, index) => {
      result.push({
        content,
        newNumber: prefixLength + index + 1,
        oldNumber: null,
        type: 'added',
      });
    });
  appendContext(
    result,
    oldLines.slice(oldLines.length - suffixLength),
    oldLines.length - suffixLength,
    newLines.length - suffixLength,
    'after',
  );

  return result;
}

function appendContext(
  result: DiffLine[],
  lines: string[],
  oldOffset: number,
  newOffset: number,
  position: 'after' | 'before',
) {
  const visibleLines =
    lines.length > MAX_SUMMARY_CONTEXT_LINES
      ? position === 'before'
        ? lines.slice(0, MAX_SUMMARY_CONTEXT_LINES)
        : lines.slice(-MAX_SUMMARY_CONTEXT_LINES)
      : lines;
  const skippedLines = lines.length - visibleLines.length;
  const visibleOffset =
    position === 'after' && skippedLines > 0 ? skippedLines : 0;

  const appendSummaryLine = () => {
    result.push({
      content: `… ${skippedLines} 行未显示`,
      newNumber: null,
      oldNumber: null,
      type: 'context',
    });
  };

  if (skippedLines > 0 && position === 'after') {
    appendSummaryLine();
  }

  visibleLines.forEach((content, index) => {
    result.push({
      content,
      newNumber: newOffset + visibleOffset + index + 1,
      oldNumber: oldOffset + visibleOffset + index + 1,
      type: 'context',
    });
  });

  if (skippedLines > 0 && position === 'before') {
    appendSummaryLine();
  }
}

/** 计算 diff 统计（added/removed 行数）。 */
export function diffStats(oldText: string, newText: string): { added: number; removed: number } {
  const lines = computeLineDiff(oldText, newText);
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.type === 'added') added++;
    else if (line.type === 'removed') removed++;
  }
  return { added, removed };
}
