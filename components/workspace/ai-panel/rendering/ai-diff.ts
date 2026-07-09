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
