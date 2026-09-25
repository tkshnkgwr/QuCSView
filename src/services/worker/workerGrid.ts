import { SortConfig, SupportedEncoding } from '../../types/csv';
import { WorkerState } from './workerTypes';
import { parseLine, compareCellValues, escapeCell } from './workerParser';
import { encodeToBytes } from './workerEncoding';

/**
 * 画面内スライスの抽出処理（ソート・フィルタ対応）
 */
export function getSliceWorker(
  state: WorkerState,
  payload: {
    startRow: number;
    rowCount: number;
    filterIndices?: number[];
    sortConfig?: SortConfig;
  }
) {
  const { startRow, rowCount, filterIndices, sortConfig } = payload;
  const totalRows = state.lines.length;
  const rows: string[][] = [];
  const originalRowIndices: number[] = [];

  let targetIndices: number[];
  if (Array.isArray(filterIndices)) {
    targetIndices = [...filterIndices];
  } else {
    targetIndices = Array.from({ length: totalRows }, (_, i) => i);
  }

  // ソート適用
  if (
    sortConfig &&
    sortConfig.column !== null &&
    sortConfig.column !== undefined &&
    sortConfig.column >= 0 &&
    sortConfig.column < state.headers.length &&
    sortConfig.direction
  ) {
    const col = sortConfig.column;
    const isAsc = sortConfig.direction === 'asc';

    const cellValues = new Array<string>(targetIndices.length);
    for (let i = 0; i < targetIndices.length; i++) {
      const physicalRow = targetIndices[i];
      const modKey = `${physicalRow},${col}`;
      if (state.modifiedCells.has(modKey)) {
        cellValues[i] = state.modifiedCells.get(modKey)!;
      } else {
        const rawLine = state.lines[physicalRow] || '';
        const cells = parseLine(rawLine, state.delimiter);
        cellValues[i] = cells[col] || '';
      }
    }

    const indexed = targetIndices.map((idx, i) => ({ idx, val: cellValues[i] }));
    indexed.sort((a, b) => {
      const cmp = isAsc ? compareCellValues(a.val, b.val) : compareCellValues(b.val, a.val);
      if (cmp !== 0) return cmp;
      return a.idx - b.idx;
    });
    targetIndices = indexed.map((item) => item.idx);
  }

  const totalEffective = targetIndices.length;
  const actualStart = Math.max(0, Math.min(startRow, totalEffective));
  const actualEnd = Math.min(actualStart + rowCount, totalEffective);

  for (let i = actualStart; i < actualEnd; i++) {
    const physicalRowIdx = targetIndices[i];
    if (physicalRowIdx >= 0 && physicalRowIdx < totalRows) {
      const rawLine = state.lines[physicalRowIdx] || '';
      const cells = parseLine(rawLine, state.delimiter);

      while (cells.length < state.headers.length) {
        cells.push('');
      }

      for (let c = 0; c < state.headers.length; c++) {
        const key = `${physicalRowIdx},${c}`;
        if (state.modifiedCells.has(key)) {
          cells[c] = state.modifiedCells.get(key)!;
        }
      }

      rows.push(cells);
      originalRowIndices.push(physicalRowIdx);
    }
  }

  return {
    startRow: actualStart,
    rows,
    totalRows: totalEffective,
    originalRowIndices,
  };
}

/**
 * 選択範囲の TSV テキスト取得
 */
export function getRangeTsvWorker(
  state: WorkerState,
  payload: {
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
    filterIndices?: number[];
    sortConfig?: SortConfig;
  }
) {
  const { startRow, endRow, startCol, endCol, filterIndices, sortConfig } = payload;
  const totalRows = state.lines.length;
  let targetIndices: number[];
  if (Array.isArray(filterIndices)) {
    targetIndices = [...filterIndices];
  } else {
    targetIndices = Array.from({ length: totalRows }, (_, i) => i);
  }

  if (
    sortConfig &&
    sortConfig.column !== null &&
    sortConfig.column !== undefined &&
    sortConfig.column >= 0 &&
    sortConfig.column < state.headers.length &&
    sortConfig.direction
  ) {
    const col = sortConfig.column;
    const isAsc = sortConfig.direction === 'asc';

    const cellValues = new Array<string>(targetIndices.length);
    for (let i = 0; i < targetIndices.length; i++) {
      const physicalRow = targetIndices[i];
      const modKey = `${physicalRow},${col}`;
      if (state.modifiedCells.has(modKey)) {
        cellValues[i] = state.modifiedCells.get(modKey)!;
      } else {
        const rawLine = state.lines[physicalRow] || '';
        const cells = parseLine(rawLine, state.delimiter);
        cellValues[i] = cells[col] || '';
      }
    }

    const indexed = targetIndices.map((idx, i) => ({ idx, val: cellValues[i] }));
    indexed.sort((a, b) => {
      const cmp = isAsc ? compareCellValues(a.val, b.val) : compareCellValues(b.val, a.val);
      if (cmp !== 0) return cmp;
      return a.idx - b.idx;
    });
    targetIndices = indexed.map((item) => item.idx);
  }

  const minR = Math.max(0, Math.min(startRow, endRow));
  const maxR = Math.min(targetIndices.length - 1, Math.max(startRow, endRow));
  const minC = Math.max(0, Math.min(startCol, endCol));
  const maxC = Math.min(state.headers.length - 1, Math.max(startCol, endCol));

  const tsvLines: string[] = [];
  for (let r = minR; r <= maxR; r++) {
    const physicalRowIdx = targetIndices[r];
    if (physicalRowIdx >= 0 && physicalRowIdx < totalRows) {
      const rawLine = state.lines[physicalRowIdx] || '';
      const cells = parseLine(rawLine, state.delimiter);
      while (cells.length < state.headers.length) cells.push('');

      const rowVals: string[] = [];
      for (let c = minC; c <= maxC; c++) {
        const key = `${physicalRowIdx},${c}`;
        const val = state.modifiedCells.has(key) ? state.modifiedCells.get(key)! : (cells[c] || '');
        rowVals.push(val);
      }
      tsvLines.push(rowVals.join('\t'));
    }
  }

  return {
    tsvText: tsvLines.join('\n'),
    rowCount: Math.max(0, maxR - minR + 1),
    colCount: Math.max(0, maxC - minC + 1),
  };
}

/**
 * 行の挿入処理
 */
export function insertRowWorker(state: WorkerState, row: number, rowData?: string[]) {
  const targetRow = Math.max(0, Math.min(row, state.lines.length));
  const cells = rowData || new Array(state.headers.length).fill('');
  const lineStr = cells.join(state.delimiter);

  const newModified = new Map<string, string>();
  state.modifiedCells.forEach((val, key) => {
    const [rStr, cStr] = key.split(',');
    const r = Number(rStr);
    const c = Number(cStr);
    if (r >= targetRow) {
      newModified.set(`${r + 1},${c}`, val);
    } else {
      newModified.set(key, val);
    }
  });
  state.modifiedCells = newModified;
  state.lines.splice(targetRow, 0, lineStr);

  return {
    totalRows: state.lines.length,
    totalCols: state.headers.length,
    headers: state.headers,
    hasHeader: state.hasHeader,
    isDirty: true,
  };
}

/**
 * 行の削除処理
 */
export function deleteRowWorker(state: WorkerState, row: number) {
  if (row < 0 || row >= state.lines.length) {
    throw new Error('Row index out of bounds');
  }

  const deletedCells = parseLine(state.lines[row] || '', state.delimiter);
  while (deletedCells.length < state.headers.length) deletedCells.push('');
  for (let c = 0; c < state.headers.length; c++) {
    const key = `${row},${c}`;
    if (state.modifiedCells.has(key)) {
      deletedCells[c] = state.modifiedCells.get(key)!;
    }
  }

  const newModified = new Map<string, string>();
  state.modifiedCells.forEach((val, key) => {
    const [rStr, cStr] = key.split(',');
    const r = Number(rStr);
    const c = Number(cStr);
    if (r !== row) {
      if (r > row) {
        newModified.set(`${r - 1},${c}`, val);
      } else {
        newModified.set(key, val);
      }
    }
  });
  state.modifiedCells = newModified;
  state.lines.splice(row, 1);

  return {
    totalRows: state.lines.length,
    totalCols: state.headers.length,
    headers: state.headers,
    hasHeader: state.hasHeader,
    deletedData: deletedCells,
    isDirty: true,
  };
}

/**
 * 行の複製処理
 */
export function duplicateRowWorker(state: WorkerState, sourceRow: number, targetRow?: number) {
  if (sourceRow < 0 || sourceRow >= state.lines.length) {
    throw new Error('Source row index out of bounds');
  }

  const cells = parseLine(state.lines[sourceRow] || '', state.delimiter);
  while (cells.length < state.headers.length) cells.push('');
  for (let c = 0; c < state.headers.length; c++) {
    const key = `${sourceRow},${c}`;
    if (state.modifiedCells.has(key)) {
      cells[c] = state.modifiedCells.get(key)!;
    }
  }

  const insertIdx = targetRow !== undefined ? targetRow : sourceRow + 1;
  const lineStr = cells.join(state.delimiter);

  const newModified = new Map<string, string>();
  state.modifiedCells.forEach((val, key) => {
    const [rStr, cStr] = key.split(',');
    const r = Number(rStr);
    const c = Number(cStr);
    if (r >= insertIdx) {
      newModified.set(`${r + 1},${c}`, val);
    } else {
      newModified.set(key, val);
    }
  });
  state.modifiedCells = newModified;
  state.lines.splice(insertIdx, 0, lineStr);

  return {
    totalRows: state.lines.length,
    totalCols: state.headers.length,
    headers: state.headers,
    hasHeader: state.hasHeader,
    rowData: cells,
    insertedRow: insertIdx,
    isDirty: true,
  };
}

/**
 * 列の挿入処理
 */
export function insertColWorker(state: WorkerState, col: number, headerName?: string) {
  const targetCol = Math.max(0, Math.min(col, state.headers.length));
  const newHeader = headerName || `Col ${state.headers.length + 1}`;
  state.headers.splice(targetCol, 0, newHeader);

  const newModified = new Map<string, string>();
  state.modifiedCells.forEach((val, key) => {
    const [rStr, cStr] = key.split(',');
    const r = Number(rStr);
    const c = Number(cStr);
    if (c >= targetCol) {
      newModified.set(`${r},${c + 1}`, val);
    } else {
      newModified.set(key, val);
    }
  });
  state.modifiedCells = newModified;

  for (let r = 0; r < state.lines.length; r++) {
    const cells = parseLine(state.lines[r] || '', state.delimiter);
    while (cells.length < targetCol) cells.push('');
    cells.splice(targetCol, 0, '');
    state.lines[r] = cells.join(state.delimiter);
  }

  return {
    totalRows: state.lines.length,
    totalCols: state.headers.length,
    headers: state.headers,
    hasHeader: state.hasHeader,
    isDirty: true,
  };
}

/**
 * 列の削除処理
 */
export function deleteColWorker(state: WorkerState, col: number) {
  if (col < 0 || col >= state.headers.length) {
    throw new Error('Column index out of bounds');
  }

  const deletedHeader = state.headers[col];
  const deletedColValues: string[] = [];

  for (let r = 0; r < state.lines.length; r++) {
    const key = `${r},${col}`;
    if (state.modifiedCells.has(key)) {
      deletedColValues.push(state.modifiedCells.get(key)!);
    } else {
      const cells = parseLine(state.lines[r] || '', state.delimiter);
      deletedColValues.push(cells[col] || '');
    }
  }

  state.headers.splice(col, 1);

  const newModified = new Map<string, string>();
  state.modifiedCells.forEach((val, key) => {
    const [rStr, cStr] = key.split(',');
    const r = Number(rStr);
    const c = Number(cStr);
    if (c !== col) {
      if (c > col) {
        newModified.set(`${r},${c - 1}`, val);
      } else {
        newModified.set(key, val);
      }
    }
  });
  state.modifiedCells = newModified;

  for (let r = 0; r < state.lines.length; r++) {
    const cells = parseLine(state.lines[r] || '', state.delimiter);
    if (col < cells.length) {
      cells.splice(col, 1);
    }
    state.lines[r] = cells.join(state.delimiter);
  }

  return {
    totalRows: state.lines.length,
    totalCols: state.headers.length,
    headers: state.headers,
    hasHeader: state.hasHeader,
    deletedHeader,
    deletedColValues,
    isDirty: true,
  };
}

/**
 * 列の複製処理
 */
export function duplicateColWorker(
  state: WorkerState,
  sourceCol: number,
  targetCol?: number,
  headerName?: string
) {
  if (sourceCol < 0 || sourceCol >= state.headers.length) {
    throw new Error('Source column index out of bounds');
  }

  const insertCol = targetCol !== undefined ? targetCol : sourceCol + 1;
  const newHeader = headerName || `${state.headers[sourceCol]}_copy`;
  state.headers.splice(insertCol, 0, newHeader);

  const newModified = new Map<string, string>();
  state.modifiedCells.forEach((val, key) => {
    const [rStr, cStr] = key.split(',');
    const r = Number(rStr);
    const c = Number(cStr);
    if (c >= insertCol) {
      newModified.set(`${r},${c + 1}`, val);
    } else {
      newModified.set(key, val);
    }
  });
  state.modifiedCells = newModified;

  const colValues: string[] = [];
  for (let r = 0; r < state.lines.length; r++) {
    const srcKey = `${r},${sourceCol}`;
    let val = '';
    if (state.modifiedCells.has(srcKey)) {
      val = state.modifiedCells.get(srcKey)!;
    } else {
      const cells = parseLine(state.lines[r] || '', state.delimiter);
      val = cells[sourceCol] || '';
    }
    colValues.push(val);

    const cells = parseLine(state.lines[r] || '', state.delimiter);
    while (cells.length < insertCol) cells.push('');
    cells.splice(insertCol, 0, val);
    state.lines[r] = cells.join(state.delimiter);
  }

  return {
    totalRows: state.lines.length,
    totalCols: state.headers.length,
    headers: state.headers,
    hasHeader: state.hasHeader,
    colValues,
    headerName: newHeader,
    insertedCol: insertCol,
    isDirty: true,
  };
}

/**
 * CSV分割エクスポート処理
 */
export function splitFileWorker(
  state: WorkerState,
  payload: {
    chunkRows: number;
    includeHeader: boolean;
    prefix: string;
    encoding?: SupportedEncoding;
    lineEnding?: string;
  }
) {
  const { chunkRows, includeHeader, prefix, encoding, lineEnding } = payload;
  const totalRows = state.lines.length;
  const le = lineEnding === 'CRLF' ? '\r\n' : '\n';
  const targetEncoding: SupportedEncoding = encoding || state.encoding || 'UTF-8';

  const headerStr = includeHeader && state.hasHeader ? state.headers.map((h) => escapeCell(h, state.delimiter)).join(state.delimiter) + le : '';

  const chunks: Array<{ fileName: string; rowCount: number; bytes: Uint8Array; text: string }> = [];
  const numChunks = Math.ceil(totalRows / chunkRows);

  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkRows;
    const end = Math.min(start + chunkRows, totalRows);
    let chunkText = headerStr;

    for (let r = start; r < end; r++) {
      const rawLine = state.lines[r] || '';
      const cells = parseLine(rawLine, state.delimiter);
      while (cells.length < state.headers.length) cells.push('');

      for (let c = 0; c < state.headers.length; c++) {
        const key = `${r},${c}`;
        if (state.modifiedCells.has(key)) {
          cells[c] = state.modifiedCells.get(key)!;
        }
      }
      chunkText += cells.map((cell) => escapeCell(cell, state.delimiter)).join(state.delimiter) + le;
    }

    const chunkBytes = encodeToBytes(chunkText, targetEncoding);
    const chunkFileName = `${prefix}_part${String(i + 1).padStart(3, '0')}.csv`;

    chunks.push({
      fileName: chunkFileName,
      rowCount: end - start,
      bytes: chunkBytes,
      text: chunkText,
    });
  }

  return {
    totalChunks: chunks.length,
    chunks,
  };
}

/**
 * CSVエクスポート処理
 */
export function exportCsvWorker(
  state: WorkerState,
  payload: {
    encoding?: SupportedEncoding;
    lineEnding?: string;
    delimiter?: string;
  }
) {
  const { encoding, lineEnding, delimiter: customDelimiter } = payload;
  const outDelimiter = customDelimiter || state.delimiter || ',';
  const le = lineEnding === 'CRLF' ? '\r\n' : '\n';
  const targetEncoding: SupportedEncoding = encoding || state.encoding || 'UTF-8';

  if (customDelimiter && customDelimiter !== state.delimiter) {
    state.delimiter = customDelimiter;
  }

  let output = '';
  if (state.hasHeader) {
    const headerLine = state.headers.map((h) => escapeCell(h, outDelimiter)).join(outDelimiter);
    output = headerLine + le;
  }

  for (let r = 0; r < state.lines.length; r++) {
    const rawLine = state.lines[r] || '';
    const cells = parseLine(rawLine, state.delimiter);
    while (cells.length < state.headers.length) cells.push('');

    for (let c = 0; c < state.headers.length; c++) {
      const key = `${r},${c}`;
      if (state.modifiedCells.has(key)) {
        cells[c] = state.modifiedCells.get(key)!;
      }
    }

    output += cells.map((cell) => escapeCell(cell, outDelimiter)).join(outDelimiter) + le;
  }

  const outputBytes = encodeToBytes(output, targetEncoding);

  return {
    text: output,
    bytes: outputBytes,
    encoding: targetEncoding,
    lineEnding,
    delimiter: outDelimiter,
  };
}
