// UPDATE 2026-08-21: [文字コード完全対応 & バイナリIPC]
// なぜ: Shift_JIS(CP932)やEUC-JP等の日本語文字コードのCSVを開く際にfile.text()によるUTF-8強制デコードでの文字化けを防ぐため、
// ArrayBufferバイナリ転送による自動判定・デコードおよび文字コード再適用(reloadWithEncoding)を実装。

import {
  FileMetadata,
  SupportedEncoding,
  SupportedLineEnding,
  SupportedDelimiter,
  VirtualSliceResponse,
  SearchMatch,
  SortConfig,
} from '../types/csv';

let worker: Worker | null = null;
let messageIdCounter = 0;
const pendingCallbacks = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./csvWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent) => {
      const { id, success, data, error } = e.data;
      const callback = pendingCallbacks.get(id);
      if (callback) {
        pendingCallbacks.delete(id);
        if (success) {
          callback.resolve(data);
        } else {
          callback.reject(new Error(error));
        }
      }
    };
  }
  return worker;
}

function sendWorkerMessage<T>(type: string, payload: any, transferList?: Transferable[]): Promise<T> {
  const id = ++messageIdCounter;
  const w = getWorker();
  return new Promise<T>((resolve, reject) => {
    pendingCallbacks.set(id, { resolve, reject });
    if (transferList && transferList.length > 0) {
      w.postMessage({ id, type, payload }, transferList);
    } else {
      w.postMessage({ id, type, payload });
    }
  });
}

/**
 * 実行環境がTauriネイティブデスクトップアプリかどうかを判定
 * @returns Tauri環境であれば true、Webブラウザ環境であれば false
 */
export const isTauriEnv = (): boolean => {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
};

/**
 * Tauri ネイティブ (Rust) と WebWorker (JavaScript) のハイブリッドIPCブリッジ
 *
 * デスクトップ起動時は Rust 製高速 CSV エンジン（memmap2 / rayon / regex）にネイティブ呼び出しを行い、
 * Webブラウザでのプレビュー実行時は WebWorker に自動フォールバックして同等機能を提供します。
 */
export class TauriBridge {
  /**
   * CSV/TSVファイルのオープン（ArrayBufferバイナリ読み込みによるShift_JIS/EUC-JP/UTF-8文字化け完全防止）
   */
  static async openFile(
    file: File,
    customDelimiter?: SupportedDelimiter,
    forcedEncoding?: SupportedEncoding
  ): Promise<FileMetadata> {
    if (isTauriEnv()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<FileMetadata>('open_csv_file', {
          path: (file as any).path || file.name,
          customDelimiter: customDelimiter || null,
        });
      } catch (err) {
        console.warn('Tauri invoke failed, falling back to WebWorker:', err);
      }
    }

    const buffer = await file.arrayBuffer();
    return sendWorkerMessage<FileMetadata>(
      'OPEN_FILE_BUFFER',
      {
        buffer,
        fileName: file.name,
        fileSize: file.size,
        customDelimiter,
        forcedEncoding,
      },
      [buffer]
    );
  }

  /**
   * 文字コード切り替え時の即時再デコード処理
   */
  static async reloadWithEncoding(
    encoding: SupportedEncoding,
    customDelimiter?: SupportedDelimiter
  ): Promise<FileMetadata> {
    if (isTauriEnv()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<FileMetadata>('set_encoding', {
          encoding,
          customDelimiter: customDelimiter || null,
        });
      } catch (err) {
        console.warn('Tauri invoke failed, falling back to WebWorker:', err);
      }
    }

    return sendWorkerMessage<FileMetadata>('RELOAD_WITH_ENCODING', {
      encoding,
      customDelimiter,
    });
  }

  /**
   * テキスト文字列からの直接オープン（サンプルデータ生成など）
   */
  static async openFromText(
    text: string,
    fileName: string,
    customDelimiter?: SupportedDelimiter
  ): Promise<FileMetadata> {
    return sendWorkerMessage<FileMetadata>('OPEN_FILE_TEXT', {
      text,
      fileName,
      fileSize: text.length,
      customDelimiter,
    });
  }

// UPDATE 2026-08-21: [ソートパラメータ連携] getSlice に sortConfig パラメータを追加
// なぜ: ヘッダークリック時にWorkerへソート条件を伝達し、画面描画を昇順/降順に即座に並び替えるため。
  /**
   * 画面内行のみのスライス要求 (30-50行)
   */
  static async getSlice(
    startRow: number,
    rowCount: number,
    filterIndices?: number[],
    sortConfig?: SortConfig
  ): Promise<VirtualSliceResponse> {
    if (isTauriEnv()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<any>('get_slice', {
          startRow,
          rowCount,
          filterIndices: filterIndices || null,
          sortConfig: sortConfig || null,
        });
        return {
          startRow: res.start_row ?? res.startRow ?? startRow,
          rows: res.rows ?? [],
          totalRows: res.total_rows ?? res.totalRows ?? 0,
          originalRowIndices:
            res.original_row_indices ??
            res.originalRowIndices ??
            (res.rows ? res.rows.map((_: any, i: number) => startRow + i) : []),
        };
      } catch (err) {
        console.warn('Tauri invoke failed, falling back to WebWorker:', err);
      }
    }

    const workerRes = await sendWorkerMessage<VirtualSliceResponse>('GET_SLICE', {
      startRow,
      rowCount,
      filterIndices,
      sortConfig,
    });

    if (!workerRes.originalRowIndices) {
      workerRes.originalRowIndices = workerRes.rows.map((_, i) => workerRes.startRow + i);
    }
    return workerRes;
  }

  /**
   * セル直接編集（ゼロ落ち・型変換なしの生テキスト保持）
   */
  static async editCell(row: number, col: number, value: string): Promise<boolean> {
    if (isTauriEnv()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<boolean>('edit_cell', {
          row,
          col,
          value,
        });
      } catch (err) {
        console.warn('Tauri invoke failed, falling back to WebWorker:', err);
      }
    }

    return sendWorkerMessage<boolean>('EDIT_CELL', {
      row,
      col,
      value,
    });
  }

  // UPDATE 2026-08-20: [ヘッダー有無切替] 「一行目をヘッダとする」の切替API
  static async setHasHeader(hasHeader: boolean): Promise<{
    totalRows: number;
    totalCols: number;
    headers: string[];
    hasHeader: boolean;
  }> {
    if (isTauriEnv()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<any>('set_has_header', { hasHeader });
      } catch (err) {
        console.warn('Tauri invoke failed, falling back to WebWorker:', err);
      }
    }

    return sendWorkerMessage<any>('SET_HAS_HEADER', { hasHeader });
  }

  // UPDATE 2026-08-21: [選択範囲のTSVデータ抽出]
  // なぜ: 選択範囲のセルをクリップボードにTSV形式で高速コピーするため
  static async getRangeTsv(
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
    filterIndices?: number[],
    sortConfig?: SortConfig
  ): Promise<{ tsvText: string; rowCount: number; colCount: number }> {
    if (isTauriEnv()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<any>('get_range_tsv', {
          startRow,
          endRow,
          startCol,
          endCol,
          filterIndices: filterIndices || null,
          sortConfig: sortConfig || null,
        });
      } catch (err) {
        console.warn('Tauri invoke failed, falling back to WebWorker:', err);
      }
    }

    return sendWorkerMessage<{ tsvText: string; rowCount: number; colCount: number }>('GET_RANGE_TSV', {
      startRow,
      endRow,
      startCol,
      endCol,
      filterIndices,
      sortConfig,
    });
  }

  // UPDATE 2026-08-21: [正規表現検索対応]
  // なぜ: 正規表現による高速全文検索および構文エラー通知に対応するため
  /**
   * 高速文字列検索
   */
  static async search(
    query: string,
    caseSensitive: boolean = false,
    useRegex: boolean = false,
    columnFilter: number | null = null
  ): Promise<{ matches: SearchMatch[]; error: string | null }> {
    if (isTauriEnv()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<any>('search_csv', {
          query,
          caseSensitive,
          useRegex,
          columnFilter,
        });
      } catch (err) {
        console.warn('Tauri invoke failed, falling back to WebWorker:', err);
      }
    }

    const res = await sendWorkerMessage<{ matches?: SearchMatch[]; error?: string | null } | SearchMatch[]>('SEARCH', {
      query,
      caseSensitive,
      useRegex,
      columnFilter,
    });

    if (Array.isArray(res)) {
      return { matches: res, error: null };
    }
    return {
      matches: res.matches || [],
      error: res.error || null,
    };
  }

// UPDATE 2026-08-26: [テキスト表示 & 未保存セル管理連携]
// なぜ: テキスト表示モードへのデータ取得(getCurrentText)およびテキスト直接編集反映(updateFromText)、保存時の未保存マークリセット(clearModifiedCells)を提供するため。
  /**
   * 現在の全CSVテキストを未保存編集を反映した状態で取得
   */
  static async getCurrentText(
    lineEnding?: SupportedLineEnding,
    delimiter?: SupportedDelimiter
  ): Promise<string> {
    if (isTauriEnv()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<string>('get_raw_text', { maxLines: null });
      } catch (err) {
        console.warn('Tauri get_raw_text failed, falling back to WebWorker:', err);
      }
    }
    const res = await sendWorkerMessage<{ text: string }>('GET_CURRENT_TEXT', {
      lineEnding,
      delimiter,
    });
    return res.text;
  }

  /**
   * テキスト表示モードでの直接編集内容をテーブルエンジンへ再適用
   */
  static async updateFromText(
    text: string,
    customDelimiter?: SupportedDelimiter
  ): Promise<FileMetadata> {
    return sendWorkerMessage<FileMetadata>('UPDATE_FROM_TEXT', {
      text,
      customDelimiter,
    });
  }

  /**
   * 未保存編集セルのリセット（保存完了時）
   */
  static async clearModifiedCells(): Promise<boolean> {
    return sendWorkerMessage<boolean>('CLEAR_MODIFIED_CELLS', {});
  }

  // UPDATE 2026-08-26: [行・列の構造変更操作 & 高速ファイル分割 (Rust優先IPC)]
  // なぜ: 大規模データ（500MB超）の構造編集、値参照、テキスト取得をRust側でネイティブ高速実行するため。
  /**
   * 単一セルの現在値を取得
   */
  static async getCellValue(row: number, col: number): Promise<string> {
    if (isTauriEnv()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<string>('get_cell_value', { row, col });
      } catch (err) {
        console.warn('Tauri get_cell_value failed, falling back to WebWorker:', err);
      }
    }
    return sendWorkerMessage<string>('GET_CELL_VALUE', { row, col });
  }

  /**
   * 1行分の全セルデータを取得
   */
  static async getRowData(row: number): Promise<string[]> {
    return sendWorkerMessage<string[]>('GET_ROW_DATA', { row });
  }

  /**
   * 1列分の全セルデータを取得
   */
  static async getColData(col: number): Promise<string[]> {
    return sendWorkerMessage<string[]>('GET_COL_DATA', { col });
  }

  /**
   * 指定行位置に行を挿入
   */
  static async insertRow(row: number, rowData?: string[]): Promise<Partial<FileMetadata>> {
    if (isTauriEnv()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<Partial<FileMetadata>>('insert_row', { row, rowData: rowData || null });
      } catch (err) {
        console.warn('Tauri insert_row failed, falling back to WebWorker:', err);
      }
    }
    return sendWorkerMessage<Partial<FileMetadata>>('INSERT_ROW', { row, rowData });
  }

  /**
   * 指定行を削除
   */
  static async deleteRow(row: number): Promise<{ deletedData: string[] } & Partial<FileMetadata>> {
    if (isTauriEnv()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const [deletedData, totalRows] = await invoke<[string[], number]>('delete_row', { row });
        return { deletedData, totalRows, isDirty: true };
      } catch (err) {
        console.warn('Tauri delete_row failed, falling back to WebWorker:', err);
      }
    }
    return sendWorkerMessage<{ deletedData: string[] } & Partial<FileMetadata>>('DELETE_ROW', { row });
  }

  /**
   * 指定行を複製
   */
  static async duplicateRow(sourceRow: number, targetRow?: number): Promise<{ rowData: string[]; insertedRow: number } & Partial<FileMetadata>> {
    if (isTauriEnv()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const [insertedRow, rowData, totalRows] = await invoke<[number, string[], number]>('duplicate_row', {
          sourceRow,
          targetRow: targetRow ?? null,
        });
        return { rowData, insertedRow, totalRows, isDirty: true };
      } catch (err) {
        console.warn('Tauri duplicate_row failed, falling back to WebWorker:', err);
      }
    }
    return sendWorkerMessage<{ rowData: string[]; insertedRow: number } & Partial<FileMetadata>>('DUPLICATE_ROW', { sourceRow, targetRow });
  }

  /**
   * 指定列位置に列を挿入
   */
  static async insertCol(col: number, headerName?: string): Promise<Partial<FileMetadata>> {
    if (isTauriEnv()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<Partial<FileMetadata>>('insert_col', { col, headerName: headerName || null });
      } catch (err) {
        console.warn('Tauri insert_col failed, falling back to WebWorker:', err);
      }
    }
    return sendWorkerMessage<Partial<FileMetadata>>('INSERT_COL', { col, headerName });
  }

  /**
   * 指定列を削除
   */
  static async deleteCol(col: number): Promise<{ deletedHeader: string; deletedColValues: string[] } & Partial<FileMetadata>> {
    if (isTauriEnv()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const [deletedHeader, deletedColValues, totalCols, headers] = await invoke<[string, string[], number, string[]]>('delete_col', { col });
        return { deletedHeader, deletedColValues, totalCols, headers, isDirty: true };
      } catch (err) {
        console.warn('Tauri delete_col failed, falling back to WebWorker:', err);
      }
    }
    return sendWorkerMessage<{ deletedHeader: string; deletedColValues: string[] } & Partial<FileMetadata>>('DELETE_COL', { col });
  }

  /**
   * 指定列を複製
   */
  static async duplicateCol(sourceCol: number, targetCol?: number, headerName?: string): Promise<{ colValues: string[]; headerName: string; insertedCol: number } & Partial<FileMetadata>> {
    if (isTauriEnv()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const [insertedCol, resHeader, colValues, totalCols, headers] = await invoke<[number, string, string[], number, string[]]>('duplicate_col', {
          sourceCol,
          targetCol: targetCol ?? null,
          headerName: headerName || null,
        });
        return { colValues, headerName: resHeader, insertedCol, totalCols, headers, isDirty: true };
      } catch (err) {
        console.warn('Tauri duplicate_col failed, falling back to WebWorker:', err);
      }
    }
    return sendWorkerMessage<{ colValues: string[]; headerName: string; insertedCol: number } & Partial<FileMetadata>>('DUPLICATE_COL', { sourceCol, targetCol, headerName });
  }

  /**
   * 行数指定による高速ファイル分割エクスポート
   */
  static async splitFile(config: {
    chunkRows: number;
    includeHeader: boolean;
    prefix: string;
    encoding?: SupportedEncoding;
    lineEnding?: SupportedLineEnding;
  }): Promise<{
    totalChunks: number;
    totalRows: number;
    chunks: Array<{ fileName: string; rowCount: number; bytes: Uint8Array; text: string }>;
  }> {
    return sendWorkerMessage<{
      totalChunks: number;
      totalRows: number;
      chunks: Array<{ fileName: string; rowCount: number; bytes: Uint8Array; text: string }>;
    }>('SPLIT_FILE', config);
  }

// UPDATE 2026-08-21: [保存文字コードバイナリ出力]
// なぜ: Shift_JIS / EUC-JP / UTF-8 BOM指定保存時に正確な文字コードのバイナリBlobをダウンロードさせるため。
  /**
   * ファイル保存（指定ファイル名・エンコーディング・改行コード・区切り文字）
   */
  static async saveFile(
    fileName: string,
    encoding: SupportedEncoding,
    lineEnding: SupportedLineEnding,
    delimiter?: SupportedDelimiter
  ): Promise<void> {
    if (isTauriEnv()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('save_csv', {
          path: fileName,
          encoding,
          lineEnding,
          delimiter: delimiter || null,
        });
        return;
      } catch (err) {
        console.warn('Tauri invoke failed, falling back to browser download:', err);
      }
    }

    const { bytes, text } = await sendWorkerMessage<{ bytes?: Uint8Array; text: string }>('EXPORT_CSV', {
      encoding,
      lineEnding,
      delimiter,
    });

    const isTsv = delimiter === '\t' || fileName.toLowerCase().endsWith('.tsv');
    const charsetMap: Record<SupportedEncoding, string> = {
      'UTF-8': 'utf-8',
      'UTF-8 BOM': 'utf-8',
      'Shift_JIS': 'shift_jis',
      'EUC-JP': 'euc-jp',
    };
    const charsetStr = charsetMap[encoding] || 'utf-8';
    const mimeType = isTsv
      ? `text/tab-separated-values;charset=${charsetStr};`
      : `text/csv;charset=${charsetStr};`;

    let blob: Blob;
    if (bytes && bytes instanceof Uint8Array) {
      blob = new Blob([bytes], { type: mimeType });
    } else {
      blob = new Blob([text], { type: mimeType });
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
