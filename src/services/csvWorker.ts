import { SupportedEncoding } from '../types/csv';
import { WorkerState } from './worker/workerTypes';
import { detectEncoding, decodeBytes } from './worker/workerEncoding';
import { parseTextLines, parseLine } from './worker/workerParser';
import { searchWorker, replaceCellWorker, replaceAllWorker } from './worker/workerSearch';
import {
  getSliceWorker,
  getRangeTsvWorker,
  insertRowWorker,
  deleteRowWorker,
  duplicateRowWorker,
  insertColWorker,
  deleteColWorker,
  duplicateColWorker,
  splitFileWorker,
  exportCsvWorker,
} from './worker/workerGrid';

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

self.onmessage = (e: MessageEvent) => {
  const { id, type, payload } = e.data;

  try {
    switch (type) {
      case 'OPEN_FILE_BUFFER': {
        const { buffer, fileName, fileSize, customDelimiter, forcedEncoding } = payload;
        const startTime = performance.now();

        const uint8Array = new Uint8Array(buffer);
        state.rawBuffer = buffer;
        state.rawBytes = uint8Array;
        state.fileName = fileName;
        state.fileSize = fileSize;

        const encoding: SupportedEncoding = forcedEncoding || detectEncoding(uint8Array);
        state.encoding = encoding;

        const text = decodeBytes(uint8Array, encoding);
        parseTextLines(text, state, customDelimiter, fileName);

        const loadTimeMs = Math.round(performance.now() - startTime);

        self.postMessage({
          id,
          success: true,
          data: {
            fileName,
            fileSize,
            totalRows: state.lines.length,
            totalCols: state.headers.length,
            headers: state.headers,
            hasHeader: state.hasHeader,
            encoding: state.encoding,
            delimiter: state.delimiter,
            lineEnding: state.lineEnding,
            loadTimeMs,
          },
        });
        break;
      }

      case 'RELOAD_WITH_ENCODING': {
        const { encoding, customDelimiter } = payload;
        if (!state.rawBytes) {
          self.postMessage({ id, success: false, error: 'No raw buffer available' });
          return;
        }

        const startTime = performance.now();
        state.encoding = encoding;

        const text = decodeBytes(state.rawBytes, encoding);
        parseTextLines(text, state, customDelimiter || state.delimiter);

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
            delimiter: state.delimiter,
            lineEnding: state.lineEnding,
            loadTimeMs,
          },
        });
        break;
      }

      case 'OPEN_FILE_TEXT': {
        const { text, fileName, fileSize, customDelimiter } = payload;
        const startTime = performance.now();

        state.fileName = fileName;
        state.fileSize = fileSize;
        state.encoding = 'UTF-8';
        state.rawBuffer = null;
        state.rawBytes = null;

        parseTextLines(text, state, customDelimiter, fileName);

        const loadTimeMs = Math.round(performance.now() - startTime);

        self.postMessage({
          id,
          success: true,
          data: {
            fileName,
            fileSize,
            totalRows: state.lines.length,
            totalCols: state.headers.length,
            headers: state.headers,
            hasHeader: state.hasHeader,
            encoding: state.encoding,
            delimiter: state.delimiter,
            lineEnding: state.lineEnding,
            loadTimeMs,
          },
        });
        break;
      }

      case 'SET_HAS_HEADER': {
        const { hasHeader } = payload;
        if (state.hasHeader !== hasHeader) {
          state.hasHeader = hasHeader;

          if (!hasHeader) {
            state.lines = [...state.rawLines];
            state.headers = Array.from({ length: state.headers.length }, (_, i) => String(i + 1));
          } else {
            const headerLine = state.rawLines[0] || '';
            const parsedFirstLine = parseLine(headerLine, state.delimiter);
            state.headers = parsedFirstLine.map((h, i) => h.trim() || `Col ${i + 1}`);
            state.rawHeaders = parsedFirstLine.map((h) => h);
            state.lines = state.rawLines.slice(1);
          }
          state.modifiedCells.clear();
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

      case 'GET_SLICE': {
        const result = getSliceWorker(state, payload);
        self.postMessage({ id, success: true, data: result });
        break;
      }

      case 'EDIT_CELL': {
        const { row, col, value } = payload;
        const key = `${row},${col}`;
        state.modifiedCells.set(key, value);
        self.postMessage({ id, success: true, data: { row, col, value } });
        break;
      }

      case 'SEARCH': {
        const result = searchWorker(state, payload);
        self.postMessage({ id, success: true, data: result });
        break;
      }

      case 'GET_RANGE_TSV': {
        const result = getRangeTsvWorker(state, payload);
        self.postMessage({ id, success: true, data: result });
        break;
      }

      case 'GET_CURRENT_TEXT': {
        const { lineEnding, delimiter: customDelimiter } = payload || {};
        const le = lineEnding === 'CRLF' ? '\r\n' : '\n';
        const d = customDelimiter || state.delimiter;

        let output = '';
        if (state.hasHeader) {
          const headerFields =
            state.rawHeaders.length > 0
              ? state.rawHeaders
              : state.headers.map((h) => (h.startsWith('Col ') ? '' : h));
          output += headerFields.join(d) + le;
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
          output += cells.join(d) + le;
        }

        self.postMessage({ id, success: true, data: output });
        break;
      }

      case 'UPDATE_FROM_TEXT': {
        const { text, customDelimiter } = payload;
        const d = customDelimiter || state.delimiter;
        parseTextLines(text, state, d);

        self.postMessage({
          id,
          success: true,
          data: {
            fileName: state.fileName,
            fileSize: new TextEncoder().encode(text).length,
            totalRows: state.lines.length,
            totalCols: state.headers.length,
            headers: state.headers,
            hasHeader: state.hasHeader,
            encoding: state.encoding,
            delimiter: state.delimiter,
            lineEnding: state.lineEnding,
            isDirty: true,
          },
        });
        break;
      }

      case 'CLEAR_MODIFIED_CELLS': {
        state.modifiedCells.clear();
        self.postMessage({ id, success: true });
        break;
      }

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
          self.postMessage({ id, success: false, error: 'Row out of bounds' });
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
        const result = insertRowWorker(state, row, rowData);
        self.postMessage({ id, success: true, data: result });
        break;
      }

      case 'DELETE_ROW': {
        const { row } = payload;
        const result = deleteRowWorker(state, row);
        self.postMessage({ id, success: true, data: result });
        break;
      }

      case 'DUPLICATE_ROW': {
        const { sourceRow, targetRow } = payload;
        const result = duplicateRowWorker(state, sourceRow, targetRow);
        self.postMessage({ id, success: true, data: result });
        break;
      }

      case 'INSERT_COL': {
        const { col, headerName } = payload;
        const result = insertColWorker(state, col, headerName);
        self.postMessage({ id, success: true, data: result });
        break;
      }

      case 'DELETE_COL': {
        const { col } = payload;
        const result = deleteColWorker(state, col);
        self.postMessage({ id, success: true, data: result });
        break;
      }

      case 'DUPLICATE_COL': {
        const { sourceCol, targetCol, headerName } = payload;
        const result = duplicateColWorker(state, sourceCol, targetCol, headerName);
        self.postMessage({ id, success: true, data: result });
        break;
      }

      case 'SPLIT_FILE': {
        const result = splitFileWorker(state, payload);
        self.postMessage({ id, success: true, data: result });
        break;
      }

      case 'EXPORT_CSV': {
        const result = exportCsvWorker(state, payload);
        self.postMessage({ id, success: true, data: result });
        break;
      }

      case 'REPLACE_CELL': {
        const result = replaceCellWorker(state, payload);
        self.postMessage({ id, success: true, data: result });
        break;
      }

      case 'REPLACE_ALL': {
        const result = replaceAllWorker(state, payload);
        self.postMessage({ id, success: true, data: result });
        break;
      }

      default:
        self.postMessage({ id, success: false, error: 'Unknown action type' });
    }
  } catch (err: any) {
    self.postMessage({ id, success: false, error: err.message || String(err) });
  }
};
