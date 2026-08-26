// UPDATE 2026-08-26: [TypeDoc/JSDoc コメントの全面付与]
// なぜ: 型定義およびインターフェースの役割、引数、型安全性をTypeDocで自動ドキュメント生成可能にするため。

/**
 * サポートする文字エンコーディング
 */
export type SupportedEncoding = 'UTF-8' | 'UTF-8 BOM' | 'Shift_JIS' | 'EUC-JP';

/**
 * サポートする改行コード
 */
export type SupportedLineEnding = 'CRLF' | 'LF';

/**
 * サポートする区切り文字
 */
export type SupportedDelimiter = ',' | '\t' | ';' | '|';

/**
 * UIテーマモード
 */
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * ビュー表示モード
 * - `table`: 高速CSV/TSV表形式プレビュー（仮想スクロール）
 * - `text`: 生テキストエディタ・プレビュー
 */
export type ViewMode = 'table' | 'text';

/**
 * ファイル全体のメタデータ情報
 */
export interface FileMetadata {
  /** ファイル名 */
  fileName: string;
  /** ファイルの絶対パス（ローカルファイル時） */
  filePath?: string;
  /** ファイルサイズ（バイト数） */
  fileSize: number;
  /** 総データ行数（ヘッダーを除く） */
  totalRows: number;
  /** カラム（列）数 */
  totalCols: number;
  /** ヘッダー文字列配列 */
  headers: string[];
  /** 1行目をヘッダーとして扱うかどうか */
  hasHeader?: boolean;
  /** 検出・指定された文字コード */
  encoding: SupportedEncoding;
  /** 検出・指定された改行コード */
  lineEnding: SupportedLineEnding;
  /** 検出・指定された区切り文字 */
  delimiter: SupportedDelimiter;
  /** 未保存の編集が存在するかどうか */
  isDirty: boolean;
  /** 読み込み・インデックス構築所要時間（ミリ秒） */
  loadTimeMs: number;
}

/**
 * グリッド上のセル座標 (0-indexed)
 */
export interface CellCoordinate {
  /** 行インデックス (0-indexed) */
  row: number;
  /** 列インデックス (0-indexed) */
  col: number;
}

/**
 * セル選択範囲
 */
export interface CellRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

/**
 * 検索一致セル情報
 */
export interface SearchMatch {
  /** 元CSVファイルにおける物理行インデックス (0-indexed) */
  row: number;
  /** 列インデックス (0-indexed) */
  col: number;
  /** 一致した文字列値 */
  value: string;
}

/**
 * 検索・フィルタリングのUI状態
 */
export interface SearchState {
  /** 検索クエリ文字列 */
  query: string;
  /** 大文字小文字を区別するかどうか */
  caseSensitive: boolean;
  /** 正規表現（RegEx）検索を使用するかどうか */
  useRegex: boolean;
  /** 正規表現構文エラー時のメッセージ */
  regexError?: string | null;
  /** 検索対象を限定するカラムインデックス（nullの場合は全列） */
  columnFilter: number | null;
  /** 一致行のみをグリッドに絞り込み表示するモード */
  filterMode: boolean;
  /** 一致した全セルリスト */
  matches: SearchMatch[];
  /** 現在フォーカス中のマッチインデックス */
  currentIndex: number;
  /** 検索実行中フラグ */
  isSearching: boolean;
}

/**
 * カラムソート設定
 */
export interface SortConfig {
  /** ソート対象のカラムインデックス */
  column: number | null;
  /** ソート順序（昇順・降順・未ソート） */
  direction: 'asc' | 'desc' | null;
}

/**
 * 仮想スクロールスライス要求
 */
export interface VirtualSliceRequest {
  /** 要求開始行 (0-indexed) */
  startRow: number;
  /** 要求行数（通常30〜50行） */
  rowCount: number;
}

/**
 * 仮想スクロールスライス応答
 */
export interface VirtualSliceResponse {
  /** スライスの開始行番号 (0-indexed) */
  startRow: number;
  /** 取得された行セル二次元配列 */
  rows: string[][];
  /** データセットの総行数 */
  totalRows: number;
  /** 各行の元CSVファイルにおける物理行インデックス (0-indexed) */
  originalRowIndices: number[];
}

/**
 * Undo/Redo履歴スタックに記録される編集アクション
 */
export type HistoryAction =
  | {
      type: 'EDIT_CELL';
      row: number;
      col: number;
      prevValue: string;
      newValue: string;
    }
  | {
      type: 'INSERT_ROW';
      row: number;
      rowData: string[];
    }
  | {
      type: 'DELETE_ROW';
      row: number;
      rowData: string[];
    }
  | {
      type: 'DUPLICATE_ROW';
      sourceRow: number;
      targetRow: number;
      rowData: string[];
    }
  | {
      type: 'INSERT_COL';
      col: number;
      headerName: string;
    }
  | {
      type: 'DELETE_COL';
      col: number;
      headerName: string;
      colValues: string[];
    }
  | {
      type: 'DUPLICATE_COL';
      sourceCol: number;
      targetCol: number;
      headerName: string;
      colValues: string[];
    }
  | {
      type: 'BATCH_REPLACE';
      description: string;
      changes: Array<{
        row: number;
        col: number;
        prevValue: string;
        newValue: string;
      }>;
    };

/**
 * 単一セルの置換結果
 */
export interface ReplaceResult {
  /** 置換された行インデックス (0-indexed) */
  row: number;
  /** 置換された列インデックス (0-indexed) */
  col: number;
  /** 置換前の文字列値 */
  prevValue: string;
  /** 置換後の新しい文字列値 */
  newValue: string;
}

/**
 * 一括置換レスポンス
 */
export interface ReplaceAllResponse {
  /** 置換された総セル件数 */
  replacedCount: number;
  /** 各セルの変更詳細リスト（Undo用） */
  changes: ReplaceResult[];
}

/**
 * ファイル分割実行時のパラメータ
 */
export interface SplitConfig {
  /** 1ファイルあたりのデータ行数 */
  chunkRows: number;
  /** 各分割ファイルにヘッダー行を含めるか */
  includeHeader: boolean;
  /** 出力ファイル名のプレフィックス */
  prefix: string;
  /** 出力エンコーディング */
  encoding?: SupportedEncoding;
  /** 出力改行コード */
  lineEnding?: SupportedLineEnding;
}

/**
 * 選択範囲の簡易統計情報
 */
export interface SelectionStats {
  /** 選択された総セル件数 */
  selectedCount: number;
  /** 数値として解釈できたセル件数 */
  numericCount: number;
  /** 数値セルの合計値 */
  sum: number | null;
  /** 数値セルの平均値 */
  avg: number | null;
  /** 数値セルの最小値 */
  min: number | null;
  /** 数値セルの最大値 */
  max: number | null;
}

/**
 * 最近開いたファイル履歴
 */
export interface RecentFile {
  /** ファイルのフルパス（デスクトップ環境時） */
  path?: string;
  /** ファイル名 */
  name: string;
  /** ファイルサイズ (バイト) */
  size: number;
  /** 最終オープン日時 (UNIXタイムスタンプ ms) */
  lastOpened: number;
  /** エンコーディング */
  encoding?: SupportedEncoding;
}

