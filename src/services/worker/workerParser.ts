import { WorkerState } from './workerTypes';

/**
 * 数値または通貨・パーセント文字列をパース
 */
export function parseNumeric(val: string): number | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (trimmed === '') return null;
  const clean = trimmed.replace(/^[¥$€£]/, '').replace(/,/g, '').replace(/%$/, '');
  if (/^-?\d+(\.\d+)?$/.test(clean)) {
    const num = Number(clean);
    if (!Number.isNaN(num)) return num;
  }
  return null;
}

/**
 * セル値の自然順・数値比較
 */
export function compareCellValues(a: string, b: string): number {
  if (a === '' && b === '') return 0;
  if (a === '') return 1; // 空文字は末尾に配置
  if (b === '') return -1;

  const numA = parseNumeric(a);
  const numB = parseNumeric(b);
  if (numA !== null && numB !== null) {
    return numA - numB;
  }
  return a.localeCompare(b, 'ja', { numeric: true, sensitivity: 'base' });
}

/**
 * 1行のCSV/TSVテキストを各セル配列にパース（クォート内の区切り文字・改行・エスケープを処理）
 */
export function parseLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * セル値のエスケープ（区切り文字、ダブルクォート、改行を含む場合）
 */
export function escapeCell(str: string, delimiter: string): string {
  if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * テキスト全体を行単位に分割し、ヘッダー・改行コード・区切り文字を解析して state を初期化
 */
export function parseTextLines(
  text: string,
  state: WorkerState,
  customDelimiter?: string,
  forcedFileName?: string
): void {
  // 改行コード判定
  const hasCRLF = text.includes('\r\n');
  state.lineEnding = hasCRLF ? 'CRLF' : 'LF';

  // 区切り文字判定
  let delimiter = customDelimiter || ',';
  if (!customDelimiter) {
    const fn = forcedFileName || state.fileName;
    if (fn.endsWith('.tsv')) {
      delimiter = '\t';
    } else {
      const firstLine = text.slice(0, 1024).split(/\r?\n/)[0] || '';
      const commaCount = (firstLine.match(/,/g) || []).length;
      const tabCount = (firstLine.match(/\t/g) || []).length;
      const semiCount = (firstLine.match(/;/g) || []).length;
      if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';
      else if (semiCount > commaCount) delimiter = ';';
    }
  }
  state.delimiter = delimiter;

  // 行分割
  const rawLines = text.split(hasCRLF ? '\r\n' : '\n');
  if (rawLines.length > 0 && rawLines[rawLines.length - 1].trim() === '') {
    rawLines.pop();
  }

  state.rawLines = rawLines;
  state.hasHeader = true;

  const headerLine = rawLines[0] || '';
  const parsedFirstLine = parseLine(headerLine, state.delimiter);
  state.headers = parsedFirstLine.map((h, i) => h.trim() || `Col ${i + 1}`);
  state.rawHeaders = parsedFirstLine.map((h) => h);
  state.lines = rawLines.slice(1);
  state.modifiedCells.clear();
}
