import { WorkerState } from './workerTypes';
import { parseLine } from './workerParser';

/**
 * 全文検索・正規表現検索処理
 */
export function searchWorker(
  state: WorkerState,
  payload: { query: string; caseSensitive: boolean; useRegex: boolean; columnFilter?: number | null }
): { matches: Array<{ row: number; col: number; value: string }>; error: string | null } {
  const { query, caseSensitive, useRegex, columnFilter } = payload;
  if (!query) {
    return { matches: [], error: null };
  }

  let regex: RegExp | null = null;
  if (useRegex) {
    try {
      regex = new RegExp(query, caseSensitive ? '' : 'i');
    } catch (e: any) {
      return {
        matches: [],
        error: `無効な正規表現: ${e.message || String(e)}`,
      };
    }
  }

  const normalizedQuery = caseSensitive ? query : query.toLowerCase();
  const matches: Array<{ row: number; col: number; value: string }> = [];

  for (let r = 0; r < state.lines.length; r++) {
    const rawLine = state.lines[r] || '';
    const cells = parseLine(rawLine, state.delimiter);

    for (let c = 0; c < state.headers.length; c++) {
      if (columnFilter !== null && columnFilter !== undefined && c !== columnFilter) {
        continue;
      }

      const key = `${r},${c}`;
      const cellVal = state.modifiedCells.has(key) ? state.modifiedCells.get(key)! : (cells[c] || '');

      let isMatch = false;
      if (regex) {
        regex.lastIndex = 0;
        isMatch = regex.test(cellVal);
      } else {
        const targetVal = caseSensitive ? cellVal : cellVal.toLowerCase();
        isMatch = targetVal.includes(normalizedQuery);
      }

      if (isMatch) {
        matches.push({ row: r, col: c, value: cellVal });
        if (matches.length >= 1000) break;
      }
    }
    if (matches.length >= 1000) break;
  }

  return { matches, error: null };
}

/**
 * 単一セルの置換処理
 */
export function replaceCellWorker(
  state: WorkerState,
  payload: {
    row: number;
    col: number;
    query: string;
    replacement: string;
    caseSensitive: boolean;
    useRegex: boolean;
  }
): { row: number; col: number; prevValue: string; newValue: string } | null {
  const { row, col, query, replacement, caseSensitive, useRegex } = payload;
  if (!query || row < 0 || row >= state.lines.length) {
    return null;
  }

  const currentLine = state.lines[row] || '';
  const cells = parseLine(currentLine, state.delimiter);
  if (col < 0 || col >= state.headers.length) {
    return null;
  }

  const modKey = `${row},${col}`;
  const currentVal = state.modifiedCells.has(modKey)
    ? state.modifiedCells.get(modKey)!
    : cells[col] || '';
  let newVal = currentVal;

  if (useRegex) {
    const re = new RegExp(query, caseSensitive ? 'g' : 'gi');
    newVal = currentVal.replace(re, replacement);
  } else if (caseSensitive) {
    newVal = currentVal.replaceAll(query, replacement);
  } else {
    const lowerVal = currentVal.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let res = '';
    let lastIdx = 0;
    let matchPos = lowerVal.indexOf(lowerQuery, lastIdx);

    while (matchPos !== -1) {
      res += currentVal.slice(lastIdx, matchPos) + replacement;
      lastIdx = matchPos + query.length;
      matchPos = lowerVal.indexOf(lowerQuery, lastIdx);
    }
    res += currentVal.slice(lastIdx);
    newVal = res;
  }

  if (newVal !== currentVal) {
    state.modifiedCells.set(modKey, newVal);
    return {
      row,
      col,
      prevValue: currentVal,
      newValue: newVal,
    };
  }

  return null;
}

/**
 * 一括置換処理
 */
export function replaceAllWorker(
  state: WorkerState,
  payload: {
    query: string;
    replacement: string;
    caseSensitive: boolean;
    useRegex: boolean;
    columnFilter?: number | null;
  }
): { replacedCount: number; changes: Array<{ row: number; col: number; prevValue: string; newValue: string }> } {
  const { query, replacement, caseSensitive, useRegex, columnFilter } = payload;
  const changes: Array<{ row: number; col: number; prevValue: string; newValue: string }> = [];

  if (!query || state.lines.length === 0) {
    return { replacedCount: 0, changes: [] };
  }

  let regex: RegExp | null = null;
  if (useRegex) {
    regex = new RegExp(query, caseSensitive ? 'g' : 'gi');
  }

  const lowerQuery = query.toLowerCase();

  for (let rowIdx = 0; rowIdx < state.lines.length; rowIdx++) {
    const currentLine = state.lines[rowIdx] || '';
    const cells = parseLine(currentLine, state.delimiter);

    const startCol = columnFilter !== null && columnFilter !== undefined ? columnFilter : 0;
    const endCol =
      columnFilter !== null && columnFilter !== undefined ? columnFilter + 1 : state.headers.length;

    for (let colIdx = startCol; colIdx < Math.min(endCol, state.headers.length); colIdx++) {
      const modKey = `${rowIdx},${colIdx}`;
      const currentVal = state.modifiedCells.has(modKey)
        ? state.modifiedCells.get(modKey)!
        : cells[colIdx] || '';
      let newVal = currentVal;

      if (regex) {
        regex.lastIndex = 0;
        newVal = currentVal.replace(regex, replacement);
      } else if (caseSensitive) {
        newVal = currentVal.replaceAll(query, replacement);
      } else if (currentVal.toLowerCase().includes(lowerQuery)) {
        const lowerVal = currentVal.toLowerCase();
        let res = '';
        let lastIdx = 0;
        let matchPos = lowerVal.indexOf(lowerQuery, lastIdx);

        while (matchPos !== -1) {
          res += currentVal.slice(lastIdx, matchPos) + replacement;
          lastIdx = matchPos + query.length;
          matchPos = lowerVal.indexOf(lowerQuery, lastIdx);
        }
        res += currentVal.slice(lastIdx);
        newVal = res;
      }

      if (newVal !== currentVal) {
        state.modifiedCells.set(modKey, newVal);
        changes.push({
          row: rowIdx,
          col: colIdx,
          prevValue: currentVal,
          newValue: newVal,
        });
      }
    }
  }

  return {
    replacedCount: changes.length,
    changes,
  };
}
