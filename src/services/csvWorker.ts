// UPDATE 2026-08-21: [文字コード対応強化 & ヘッダークリック並び替え対応]
// なぜ: 日本語Windows環境のExcelやレガシーシステムから出力されるShift_JIS(CP932)やEUC-JP、UTF-8 BOM付きCSVを開いた際に
// 文字化けが発生する問題を解消するため、バイナリバッファからの高精度自動エンコーディング判定・デコードおよびエンコード保存処理を実装。
// また、ヘッダークリック時の昇順・降順並び替えに対応（ただし保存時は元CSVの物理行順序を厳密に維持）。
import Encoding from 'encoding-japanese';
import { SupportedEncoding, SortConfig } from '../types/csv';

interface WorkerState {
  rawBuffer: ArrayBuffer | null;
  rawBytes: Uint8Array | null;
  fileName: string;
  fileSize: number;
  rawLines: string[];
  hasHeader: boolean;
  lines: string[];
  headers: string[];       // 表示用（空フィールドは "Col N" に置換済み）
  rawHeaders: string[];    // 元の値（空文字列のまま保持・テキスト再構築用）
  delimiter: string;
  encoding: SupportedEncoding;
  lineEnding: string;
  modifiedCells: Map<string, string>; // "row,col" -> value
}

const state: WorkerState = {
  rawBuffer: null,
  rawBytes: null,
  fileName: '',
  fileSize: 0,
  rawLines: [],
  hasHeader: true,
  lines: [],
  headers: [],
  rawHeaders: [],
  delimiter: ',',
  encoding: 'UTF-8',
  lineEnding: 'LF',
  modifiedCells: new Map(),
};

/**
 * 数値または通貨・パーセント文字列をパース
 */
function parseNumeric(val: string): number | null {
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
function compareCellValues(a: string, b: string): number {
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
 * バイナリバイト列から高精度に文字コードを自動判定
 */
function detectEncoding(bytes: Uint8Array): SupportedEncoding {
  // 1. UTF-8 BOM (0xEF, 0xBB, 0xBF)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return 'UTF-8 BOM';
  }

  // 判定用サンプル（最大64KB）
  const sample = bytes.slice(0, Math.min(bytes.length, 65536));

  // 2. encoding-japanese による検出
  const detected = Encoding.detect(sample);
  if (detected === 'SJIS') return 'Shift_JIS';
  if (detected === 'EUCJP') return 'EUC-JP';
  if (detected === 'UTF8') return 'UTF-8';

  // 3. TextDecoder UTF-8 厳密検証フォールバック
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    utf8Decoder.decode(sample);
    return 'UTF-8';
  } catch {
    // UTF-8として不正なバイト列の場合はShift_JISと判定
    return 'Shift_JIS';
  }
}

/**
 * 指定文字コードに基づきバイト列を文字列へ安全デコード
 */
function decodeBytes(bytes: Uint8Array, encoding: SupportedEncoding): string {
  let targetBytes = bytes;

  // UTF-8 BOMの場合は先頭3バイトを除去
  if (
    (encoding === 'UTF-8 BOM' || encoding === 'UTF-8') &&
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    targetBytes = bytes.slice(3);
  }

  try {
    if (encoding === 'Shift_JIS') {
      try {
        return new TextDecoder('shift_jis').decode(targetBytes);
      } catch {
        const unicodeArray = Encoding.convert(targetBytes, { to: 'UNICODE', from: 'SJIS' });
        return Encoding.codeToString(unicodeArray);
      }
    } else if (encoding === 'EUC-JP') {
      try {
        return new TextDecoder('euc-jp').decode(targetBytes);
      } catch {
        const unicodeArray = Encoding.convert(targetBytes, { to: 'UNICODE', from: 'EUCJP' });
        return Encoding.codeToString(unicodeArray);
      }
    } else {
      return new TextDecoder('utf-8').decode(targetBytes);
    }
  } catch (err) {
    console.warn(`TextDecoder failed for ${encoding}, falling back to encoding-japanese:`, err);
    const unicodeArray = Encoding.convert(targetBytes, { to: 'UNICODE', from: 'AUTO' });
    return Encoding.codeToString(unicodeArray);
  }
}

function parseTextLines(text: string, customDelimiter?: string, forcedFileName?: string) {
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

  // 行分割（大容量対応）
  const rawLines = text.split(hasCRLF ? '\r\n' : '\n');
  if (rawLines.length > 0 && rawLines[rawLines.length - 1].trim() === '') {
    rawLines.pop();
  }

  state.rawLines = rawLines;
  state.hasHeader = true;

  const headerLine = rawLines[0] || '';
  const parsedFirstLine = parseLine(headerLine, state.delimiter);
  // 表示用（空フィールドは "Col N" に置換）
  state.headers = parsedFirstLine.map((h, i) => h.trim() || `Col ${i + 1}`);
  // 元の値（空文字列のまま保持・テキスト再構築用）
  state.rawHeaders = parsedFirstLine.map((h) => h);
  state.lines = rawLines.slice(1);
  state.modifiedCells.clear();
}

function parseLine(line: string, delimiter: string): string[] {
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

self.onmessage = (e: MessageEvent) => {
  const { id, type, payload } = e.data;

  try {
    switch (type) {
      // UPDATE 2026-08-21: [バイナリバッファからの高精度オープン]
      // なぜ: 日本語Shift_JIS / EUC-JP / UTF-8 BOM付きファイルを文字化けなく開くため、Uint8Arrayから直接自動判定・デコードする。
      case 'OPEN_FILE_BUFFER': {
        const { buffer, fileName, fileSize, customDelimiter, forcedEncoding } = payload;
        const startTime = performance.now();

        const uint8Array = new Uint8Array(buffer);
        state.rawBuffer = buffer;
        state.rawBytes = uint8Array;
        state.fileName = fileName;
        state.fileSize = fileSize || uint8Array.byteLength;

        // 文字コード判定
        const encoding: SupportedEncoding = forcedEncoding || detectEncoding(uint8Array);
        state.encoding = encoding;

        // 文字列へデコード
        const text = decodeBytes(uint8Array, encoding);
        parseTextLines(text, customDelimiter, fileName);

        const loadTimeMs = Math.round(performance.now() - startTime);

        self.postMessage({
          id,
          success: true,
          data: {
            fileName: state.fileName,
            fileSize: state.fileSize,
            totalRows: state.lines.length,
            totalCols: state.headers.length,
            headers: state.headers,
            hasHeader: state.hasHeader,
            encoding: state.encoding,
            lineEnding: state.lineEnding,
            delimiter: state.delimiter,
            rawText: text,
            isDirty: false,
            loadTimeMs,
          },
        });
        break;
      }

      // UPDATE 2026-08-21: [文字コード再適用]
      // なぜ: ユーザーが手動でエンコーディング（Shift_JIS ⇔ UTF-8 ⇔ EUC-JP）を切り替えた際、
      // ファイルを再選択せず保持されたバイナリバッファから即座に再デコードして再描画するため。
      case 'RELOAD_WITH_ENCODING': {
        const { encoding, customDelimiter } = payload;
        const startTime = performance.now();

        if (state.rawBytes && state.rawBytes.length > 0) {
          state.encoding = encoding;
          const text = decodeBytes(state.rawBytes, encoding);
          parseTextLines(text, customDelimiter || state.delimiter, state.fileName);
        } else {
          state.encoding = encoding;
        }

        const loadTimeMs = Math.round(performance.now() - startTime);

        self.postMessage({
          id,
          success: true,
          data: {
            fileName: state.fileName,
            fileSize: state.fileSize,
            totalRows: state.lines.length,
            totalCols: state.headers.length,
            headers: state.headers,
            hasHeader: state.hasHeader,
            encoding: state.encoding,
            lineEnding: state.lineEnding,
            delimiter: state.delimiter,
            isDirty: false,
            loadTimeMs,
          },
        });
        break;
      }

      case 'OPEN_FILE_TEXT': {
        const { text, fileName, fileSize, customDelimiter } = payload;
        const startTime = performance.now();

        state.fileName = fileName;
        state.fileSize = fileSize || text.length;
        state.rawBytes = new TextEncoder().encode(text);
        state.encoding = 'UTF-8';

        parseTextLines(text, customDelimiter, fileName);

        const loadTimeMs = Math.round(performance.now() - startTime);

        self.postMessage({
          id,
          success: true,
          data: {
            fileName,
            fileSize: state.fileSize,
            totalRows: state.lines.length,
            totalCols: state.headers.length,
            headers: state.headers,
            hasHeader: state.hasHeader,
            encoding: state.encoding,
            lineEnding: state.lineEnding,
            delimiter: state.delimiter,
            isDirty: false,
            loadTimeMs,
          },
        });
        break;
      }

// UPDATE 2026-08-20: [ヘッダー有無切替] 「一行目をヘッダとする」トグル対応
      case 'SET_HAS_HEADER': {
        const { hasHeader } = payload;
        state.hasHeader = hasHeader;
        state.modifiedCells.clear();

        if (state.rawLines.length > 0) {
          const firstLine = state.rawLines[0] || '';
          const parsedFirstLine = parseLine(firstLine, state.delimiter);
          const colCount = Math.max(parsedFirstLine.length, 1);

          if (hasHeader) {
            // 1行目をヘッダーとする（2行目以降がデータ行）
            state.headers = parsedFirstLine.map((h, i) => h.trim() || `Col ${i + 1}`);
            state.rawHeaders = parsedFirstLine.map((h) => h);
            state.lines = state.rawLines.slice(1);
          } else {
            // ヘッダーなし: ヘッダー表示は連番数字（1, 2, 3...）、1行目をデータ行（1行目）として表示
            state.headers = Array.from({ length: colCount }, (_, i) => String(i + 1));
            state.rawHeaders = [];
            state.lines = [...state.rawLines];
          }
        }

        self.postMessage({
          id,
          success: true,
          data: {
            totalRows: state.lines.length,
            totalCols: state.headers.length,
            headers: state.headers,
            hasHeader: state.hasHeader,
          },
        });
        break;
      }

// UPDATE 2026-08-21: [物理行番号サポート & ソート対応]
// なぜ: ヘッダークリック時に昇順・降順ソートされたスライスを表示し、同時に物理行番号(originalRowIndices)を正確に返却する。
// 保存時(EXPORT_CSV)は元CSVの物理行順序(state.linesの0..N-1)のまま保存するため、表示ソートと保存順序の独立性を担保する。
      case 'GET_SLICE': {
        const { startRow, rowCount, filterIndices, sortConfig } = payload as {
          startRow: number;
          rowCount: number;
          filterIndices?: number[];
          sortConfig?: SortConfig;
        };
        const totalRows = state.lines.length;
        const rows: string[][] = [];
        const originalRowIndices: number[] = [];

        // 1. 対象インデックス配列の決定（フィルタ配列 or 0..N-1）
        let targetIndices: number[];
        if (Array.isArray(filterIndices)) {
          targetIndices = [...filterIndices];
        } else {
          targetIndices = Array.from({ length: totalRows }, (_, i) => i);
        }

        // 2. ソート適用
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

          // 各行の対象列セル値を抽出
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
            return a.idx - b.idx; // 安定ソート
          });
          targetIndices = indexed.map((item) => item.idx);
        }

        // 3. 画面内スライスの抽出
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

        self.postMessage({
          id,
          success: true,
          data: {
            startRow: actualStart,
            rows,
            totalRows: totalEffective,
            originalRowIndices,
          },
        });
        break;
      }

      case 'EDIT_CELL': {
        const { row, col, value } = payload;
        if (row >= 0 && row < state.lines.length && col >= 0 && col < state.headers.length) {
          state.modifiedCells.set(`${row},${col}`, String(value)); // 型変換なしの生テキスト保持
          self.postMessage({ id, success: true, data: true });
        } else {
          self.postMessage({ id, success: false, error: 'Row or column out of bounds' });
        }
        break;
      }

      // UPDATE 2026-08-21: [正規表現（RegEx）対応の高速全文検索]
      // なぜ: 単純な部分一致だけでなく、正規表現（正規表現パターン）による高度な抽出・検索を可能にするため。
      case 'SEARCH': {
        const { query, caseSensitive, useRegex, columnFilter } = payload;
        if (!query) {
          self.postMessage({ id, success: true, data: { matches: [], error: null } });
          return;
        }

        let regex: RegExp | null = null;
        if (useRegex) {
          try {
            regex = new RegExp(query, caseSensitive ? '' : 'i');
          } catch (e: any) {
            self.postMessage({
              id,
              success: true,
              data: {
                matches: [],
                error: `無効な正規表現: ${e.message || String(e)}`,
              },
            });
            return;
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

        self.postMessage({ id, success: true, data: { matches, error: null } });
        break;
      }

      // UPDATE 2026-08-21: [選択セル範囲のTSV取得]
      // なぜ: 選択されたセル範囲または行全体をクリップボードにタブ区切り(TSV)形式で高速コピーできるようにするため。
      case 'GET_RANGE_TSV': {
        const { startRow, endRow, startCol, endCol, filterIndices, sortConfig } = payload as {
          startRow: number;
          endRow: number;
          startCol: number;
          endCol: number;
          filterIndices?: number[];
          sortConfig?: SortConfig;
        };

        const totalRows = state.lines.length;
        let targetIndices: number[];
        if (Array.isArray(filterIndices)) {
          targetIndices = [...filterIndices];
        } else {
          targetIndices = Array.from({ length: totalRows }, (_, i) => i);
        }

        // ソート適用（画面の表示順に一致させる）
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

        const tsvText = tsvLines.join('\n');
        self.postMessage({
          id,
          success: true,
          data: {
            tsvText,
            rowCount: Math.max(0, maxR - minR + 1),
            colCount: Math.max(0, maxC - minC + 1),
          },
        });
        break;
      }

// UPDATE 2026-08-26: [エクスポート & テキスト表示 & 未保存セル管理]
// なぜ: テキスト表示モードへの完全同期(GET_CURRENT_TEXT)、テキスト直接編集からのテーブル反映(UPDATE_FROM_TEXT)、および保存時の未保存マークリセットに対応するため。
      case 'GET_CURRENT_TEXT': {
        const { lineEnding, delimiter: customDelimiter } = payload || {};
        const outDelimiter = customDelimiter || state.delimiter || ',';
        const le = lineEnding === 'CRLF' ? '\r\n' : (state.lineEnding === 'CRLF' ? '\r\n' : '\n');

        const escapeCell = (str: string) => {
          if (str.includes(outDelimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };

        let output = '';
        if (state.hasHeader) {
          // rawHeaders（元の空文字列を保持）を優先。なければ rawLines[0] から直接構築
          const headerSource =
            state.rawHeaders.length > 0
              ? state.rawHeaders
              : state.rawLines.length > 0
                ? parseLine(state.rawLines[0] || '', state.delimiter)
                : state.headers;
          const headerLine = headerSource.map(escapeCell).join(outDelimiter);
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

          output += cells.map(escapeCell).join(outDelimiter) + le;
        }

        self.postMessage({
          id,
          success: true,
          data: {
            text: output,
            totalRows: state.lines.length,
            totalCols: state.headers.length,
            delimiter: outDelimiter,
            encoding: state.encoding,
            lineEnding: state.lineEnding,
          },
        });
        break;
      }

      case 'UPDATE_FROM_TEXT': {
        const { text, customDelimiter } = payload;
        const startTime = performance.now();

        state.rawBytes = new TextEncoder().encode(text);
        parseTextLines(text, customDelimiter || state.delimiter, state.fileName);
        state.modifiedCells.clear();

        const loadTimeMs = Math.round(performance.now() - startTime);

        self.postMessage({
          id,
          success: true,
          data: {
            fileName: state.fileName,
            fileSize: text.length,
            totalRows: state.lines.length,
            totalCols: state.headers.length,
            headers: state.headers,
            hasHeader: state.hasHeader,
            encoding: state.encoding,
            lineEnding: state.lineEnding,
            delimiter: state.delimiter,
            isDirty: true,
            loadTimeMs,
          },
        });
        break;
      }

      case 'CLEAR_MODIFIED_CELLS': {
        state.modifiedCells.clear();
        self.postMessage({ id, success: true, data: true });
        break;
      }

// UPDATE 2026-08-26: [行・列の構造変更操作 & 高速ファイル分割]
// なぜ: 行の挿入/削除/複製、列の挿入/削除/複製、および大規模データの行数指定ファイル分割エクスポートに対応するため。
      case 'GET_CELL_VALUE': {
        const { row, col } = payload;
        const key = `${row},${col}`;
        if (state.modifiedCells.has(key)) {
          self.postMessage({ id, success: true, data: state.modifiedCells.get(key)! });
        } else if (row >= 0 && row < state.lines.length) {
          const cells = parseLine(state.lines[row] || '', state.delimiter);
          self.postMessage({ id, success: true, data: cells[col] || '' });
        } else {
          self.postMessage({ id, success: true, data: '' });
        }
        break;
      }

      case 'GET_ROW_DATA': {
        const { row } = payload;
        if (row >= 0 && row < state.lines.length) {
          const cells = parseLine(state.lines[row] || '', state.delimiter);
          while (cells.length < state.headers.length) cells.push('');
          for (let c = 0; c < state.headers.length; c++) {
            const key = `${row},${c}`;
            if (state.modifiedCells.has(key)) {
              cells[c] = state.modifiedCells.get(key)!;
            }
          }
          self.postMessage({ id, success: true, data: cells });
        } else {
          self.postMessage({ id, success: true, data: new Array(state.headers.length).fill('') });
        }
        break;
      }

      case 'GET_COL_DATA': {
        const { col } = payload;
        const colValues: string[] = [];
        for (let r = 0; r < state.lines.length; r++) {
          const key = `${r},${col}`;
          if (state.modifiedCells.has(key)) {
            colValues.push(state.modifiedCells.get(key)!);
          } else {
            const cells = parseLine(state.lines[r] || '', state.delimiter);
            colValues.push(cells[col] || '');
          }
        }
        self.postMessage({ id, success: true, data: colValues });
        break;
      }

      case 'INSERT_ROW': {
        const { row, rowData } = payload;
        const targetRow = Math.max(0, Math.min(row, state.lines.length));
        const cells = rowData || new Array(state.headers.length).fill('');
        const lineStr = cells.join(state.delimiter);

        // modifiedCells のインデックスをシフト
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

        self.postMessage({
          id,
          success: true,
          data: {
            totalRows: state.lines.length,
            totalCols: state.headers.length,
            headers: state.headers,
            hasHeader: state.hasHeader,
            isDirty: true,
          },
        });
        break;
      }

      case 'DELETE_ROW': {
        const { row } = payload;
        if (row >= 0 && row < state.lines.length) {
          // 削除行のデータを取得
          const deletedCells = parseLine(state.lines[row] || '', state.delimiter);
          while (deletedCells.length < state.headers.length) deletedCells.push('');
          for (let c = 0; c < state.headers.length; c++) {
            const key = `${row},${c}`;
            if (state.modifiedCells.has(key)) {
              deletedCells[c] = state.modifiedCells.get(key)!;
            }
          }

          // modifiedCells のインデックスをシフト
          const newModified = new Map<string, string>();
          state.modifiedCells.forEach((val, key) => {
            const [rStr, cStr] = key.split(',');
            const r = Number(rStr);
            const c = Number(cStr);
            if (r === row) {
              // 削除対象
            } else if (r > row) {
              newModified.set(`${r - 1},${c}`, val);
            } else {
              newModified.set(key, val);
            }
          });
          state.modifiedCells = newModified;

          state.lines.splice(row, 1);

          self.postMessage({
            id,
            success: true,
            data: {
              totalRows: state.lines.length,
              totalCols: state.headers.length,
              headers: state.headers,
              hasHeader: state.hasHeader,
              deletedData: deletedCells,
              isDirty: true,
            },
          });
        } else {
          self.postMessage({ id, success: false, error: 'Row index out of bounds' });
        }
        break;
      }

      case 'DUPLICATE_ROW': {
        const { sourceRow, targetRow } = payload;
        if (sourceRow >= 0 && sourceRow < state.lines.length) {
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

          self.postMessage({
            id,
            success: true,
            data: {
              totalRows: state.lines.length,
              totalCols: state.headers.length,
              headers: state.headers,
              hasHeader: state.hasHeader,
              rowData: cells,
              insertedRow: insertIdx,
              isDirty: true,
            },
          });
        } else {
          self.postMessage({ id, success: false, error: 'Source row index out of bounds' });
        }
        break;
      }

      case 'INSERT_COL': {
        const { col, headerName } = payload;
        const targetCol = Math.max(0, Math.min(col, state.headers.length));
        const newHeader = headerName || `Col ${state.headers.length + 1}`;

        state.headers.splice(targetCol, 0, newHeader);

        // modifiedCells の列インデックスをシフト
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

        // 全行のセル配列に空文字を挿入
        for (let r = 0; r < state.lines.length; r++) {
          const cells = parseLine(state.lines[r] || '', state.delimiter);
          while (cells.length < targetCol) cells.push('');
          cells.splice(targetCol, 0, '');
          state.lines[r] = cells.join(state.delimiter);
        }

        self.postMessage({
          id,
          success: true,
          data: {
            totalRows: state.lines.length,
            totalCols: state.headers.length,
            headers: state.headers,
            hasHeader: state.hasHeader,
            isDirty: true,
          },
        });
        break;
      }

      case 'DELETE_COL': {
        const { col } = payload;
        if (col >= 0 && col < state.headers.length) {
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
            if (c === col) {
              // 削除対象
            } else if (c > col) {
              newModified.set(`${r},${c - 1}`, val);
            } else {
              newModified.set(key, val);
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

          self.postMessage({
            id,
            success: true,
            data: {
              totalRows: state.lines.length,
              totalCols: state.headers.length,
              headers: state.headers,
              hasHeader: state.hasHeader,
              deletedHeader,
              deletedColValues,
              isDirty: true,
            },
          });
        } else {
          self.postMessage({ id, success: false, error: 'Column index out of bounds' });
        }
        break;
      }

      case 'DUPLICATE_COL': {
        const { sourceCol, targetCol, headerName } = payload;
        if (sourceCol >= 0 && sourceCol < state.headers.length) {
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

          self.postMessage({
            id,
            success: true,
            data: {
              totalRows: state.lines.length,
              totalCols: state.headers.length,
              headers: state.headers,
              hasHeader: state.hasHeader,
              colValues,
              headerName: newHeader,
              insertedCol: insertCol,
              isDirty: true,
            },
          });
        } else {
          self.postMessage({ id, success: false, error: 'Source column index out of bounds' });
        }
        break;
      }

      case 'SPLIT_FILE': {
        const { chunkRows, includeHeader, prefix, encoding, lineEnding } = payload;
        const rowsPerChunk = Math.max(1, Number(chunkRows) || 10000);
        const le = lineEnding === 'CRLF' ? '\r\n' : '\n';
        const targetEncoding: SupportedEncoding = encoding || state.encoding || 'UTF-8';
        const outDelimiter = state.delimiter || ',';

        const escapeCell = (str: string) => {
          if (str.includes(outDelimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };

        let headerLineStr = '';
        if (includeHeader && state.headers.length > 0) {
          headerLineStr = state.headers.map(escapeCell).join(outDelimiter) + le;
        }

        const totalRows = state.lines.length;
        const totalChunks = Math.ceil(totalRows / rowsPerChunk);
        const chunks: Array<{ fileName: string; rowCount: number; bytes: Uint8Array; text: string }> = [];

        const basePrefix = prefix || state.fileName.replace(/\.[^/.]+$/, '') || 'split_data';
        const ext = state.fileName.endsWith('.tsv') ? '.tsv' : '.csv';

        for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
          const startR = chunkIdx * rowsPerChunk;
          const endR = Math.min(startR + rowsPerChunk, totalRows);
          let chunkText = headerLineStr;

          for (let r = startR; r < endR; r++) {
            const rawLine = state.lines[r] || '';
            const cells = parseLine(rawLine, state.delimiter);
            while (cells.length < state.headers.length) cells.push('');

            for (let c = 0; c < state.headers.length; c++) {
              const key = `${r},${c}`;
              if (state.modifiedCells.has(key)) {
                cells[c] = state.modifiedCells.get(key)!;
              }
            }

            chunkText += cells.map(escapeCell).join(outDelimiter) + le;
          }

          // エンコーディングに応じたバイナリバイト変換
          let outputBytes: Uint8Array;
          if (targetEncoding === 'Shift_JIS') {
            const sjisArray = Encoding.convert(Encoding.stringToCode(chunkText), {
              to: 'SJIS',
              from: 'UNICODE',
            });
            outputBytes = new Uint8Array(sjisArray);
          } else if (targetEncoding === 'EUC-JP') {
            const eucArray = Encoding.convert(Encoding.stringToCode(chunkText), {
              to: 'EUCJP',
              from: 'UNICODE',
            });
            outputBytes = new Uint8Array(eucArray);
          } else if (targetEncoding === 'UTF-8 BOM') {
            const utf8Bytes = new TextEncoder().encode(chunkText);
            const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
            const combined = new Uint8Array(bom.length + utf8Bytes.length);
            combined.set(bom, 0);
            combined.set(utf8Bytes, bom.length);
            outputBytes = combined;
          } else {
            outputBytes = new TextEncoder().encode(chunkText);
          }

          const padNum = String(chunkIdx + 1).padStart(3, '0');
          const chunkFileName = `${basePrefix}_part${padNum}${ext}`;

          chunks.push({
            fileName: chunkFileName,
            rowCount: endR - startR,
            bytes: outputBytes,
            text: chunkText,
          });
        }

        self.postMessage({
          id,
          success: true,
          data: {
            totalChunks,
            totalRows,
            chunks,
          },
        });
        break;
      }

      case 'EXPORT_CSV': {
        const { encoding, lineEnding, delimiter: customDelimiter } = payload;
        const outDelimiter = customDelimiter || state.delimiter || ',';
        const le = lineEnding === 'CRLF' ? '\r\n' : '\n';
        const targetEncoding: SupportedEncoding = encoding || state.encoding || 'UTF-8';
        
        if (customDelimiter && customDelimiter !== state.delimiter) {
          state.delimiter = customDelimiter;
        }
        
        const escapeCell = (str: string) => {
          if (str.includes(outDelimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };

        let output = '';
        if (state.hasHeader) {
          const headerLine = state.headers.map(escapeCell).join(outDelimiter);
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

          output += cells.map(escapeCell).join(outDelimiter) + le;
        }

        // エンコーディングに応じたバイナリバイト変換
        let outputBytes: Uint8Array;
        if (targetEncoding === 'Shift_JIS') {
          const sjisArray = Encoding.convert(Encoding.stringToCode(output), {
            to: 'SJIS',
            from: 'UNICODE',
          });
          outputBytes = new Uint8Array(sjisArray);
        } else if (targetEncoding === 'EUC-JP') {
          const eucArray = Encoding.convert(Encoding.stringToCode(output), {
            to: 'EUCJP',
            from: 'UNICODE',
          });
          outputBytes = new Uint8Array(eucArray);
        } else if (targetEncoding === 'UTF-8 BOM') {
          const utf8Bytes = new TextEncoder().encode(output);
          const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
          const combined = new Uint8Array(bom.length + utf8Bytes.length);
          combined.set(bom, 0);
          combined.set(utf8Bytes, bom.length);
          outputBytes = combined;
        } else {
          outputBytes = new TextEncoder().encode(output);
        }

        self.postMessage({
          id,
          success: true,
          data: {
            text: output,
            bytes: outputBytes,
            encoding: targetEncoding,
            lineEnding,
            delimiter: outDelimiter,
          },
        });
        break;
      }

      case 'REPLACE_CELL': {
        const { row, col, query, replacement, caseSensitive, useRegex } = payload;
        if (!query || row < 0 || row >= state.lines.length) {
          self.postMessage({ id, success: true, data: null });
          break;
        }

        const currentLine = state.lines[row] || '';
        const cells = parseLine(currentLine, state.delimiter);
        if (col < 0 || col >= state.headers.length) {
          self.postMessage({ id, success: true, data: null });
          break;
        }

        const modKey = `${row},${col}`;
        const currentVal = state.modifiedCells.has(modKey)
          ? state.modifiedCells.get(modKey)!
          : cells[col] || '';
        let newVal = currentVal;

        if (useRegex) {
          try {
            const re = new RegExp(query, caseSensitive ? 'g' : 'gi');
            newVal = currentVal.replace(re, replacement);
          } catch {
            self.postMessage({ id, success: false, error: 'Invalid regular expression' });
            break;
          }
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

          self.postMessage({
            id,
            success: true,
            data: {
              row,
              col,
              prevValue: currentVal,
              newValue: newVal,
            },
          });
        } else {
          self.postMessage({ id, success: true, data: null });
        }
        break;
      }

      case 'REPLACE_ALL': {
        const { query, replacement, caseSensitive, useRegex, columnFilter } = payload;
        const changes: Array<{ row: number; col: number; prevValue: string; newValue: string }> = [];

        if (!query || state.lines.length === 0) {
          self.postMessage({
            id,
            success: true,
            data: { replacedCount: 0, changes: [] },
          });
          break;
        }

        let regex: RegExp | null = null;
        if (useRegex) {
          try {
            regex = new RegExp(query, caseSensitive ? 'g' : 'gi');
          } catch {
            self.postMessage({ id, success: false, error: 'Invalid regular expression' });
            break;
          }
        }

        const lowerQuery = query.toLowerCase();

        for (let rowIdx = 0; rowIdx < state.lines.length; rowIdx++) {
          const currentLine = state.lines[rowIdx] || '';
          const cells = parseLine(currentLine, state.delimiter);

          const startCol = columnFilter !== null && columnFilter !== undefined ? columnFilter : 0;
          const endCol = columnFilter !== null && columnFilter !== undefined ? columnFilter + 1 : state.headers.length;

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

        self.postMessage({
          id,
          success: true,
          data: {
            replacedCount: changes.length,
            changes,
          },
        });
        break;
      }

      default:
        self.postMessage({ id, success: false, error: 'Unknown action type' });
    }
  } catch (err: any) {
    self.postMessage({ id, success: false, error: err.message || String(err) });
  }
};
