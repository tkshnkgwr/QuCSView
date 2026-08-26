// UPDATE 2026-08-26: [CsvEngine型定義モジュール]
// なぜ: データ構造、エンコーディング定義、レスポンス型の単一責任管理のため。

//! # CsvEngine データ型定義モジュール

use serde::{Deserialize, Serialize};

/// サポートする文字エンコーディング
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SupportedEncoding {
    #[serde(rename = "UTF-8")]
    Utf8,
    #[serde(rename = "UTF-8 BOM")]
    Utf8Bom,
    #[serde(rename = "Shift_JIS")]
    ShiftJis,
    #[serde(rename = "EUC-JP")]
    EucJp,
}

/// サポートする改行コード
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[allow(clippy::upper_case_acronyms)]
pub enum SupportedLineEnding {
    CRLF,
    LF,
}

/// ソート設定構造体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SortConfig {
    /// ソート対象のカラムインデックス (0-indexed)
    pub column_index: usize,
    /// ソート方向 ("asc" または "desc")
    pub direction: String,
}

/// CSVファイルのメタデータ情報
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadata {
    /// ファイル名（パスを除く）
    pub file_name: String,
    /// ファイルの絶対パス（存在する場合）
    pub file_path: Option<String>,
    /// ファイルサイズ（バイト数）
    pub file_size: u64,
    /// 有効なデータ行数（ヘッダー行を除く）
    pub total_rows: usize,
    /// カラム（列）数
    pub total_cols: usize,
    /// ヘッダー文字列のリスト
    pub headers: Vec<String>,
    /// 検出された文字コード
    pub encoding: SupportedEncoding,
    /// 検出された改行コード
    pub line_ending: SupportedLineEnding,
    /// 検出された区切り文字（カンマ `,` またはタブ `\t` 等）
    pub delimiter: char,
    /// 未保存の変更が存在するかどうか
    pub is_dirty: bool,
    /// インデックス構築に要した時間（ミリ秒）
    pub load_time_ms: u64,
    /// 1行目をヘッダーとして扱うかどうか
    pub has_header: bool,
}

/// 単一の検索一致結果
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SearchResult {
    /// 一致したセルの行インデックス (0-indexed)
    pub row: usize,
    /// 一致したセルの列インデックス (0-indexed)
    pub col: usize,
    /// 一致したセルの文字列値
    pub value: String,
}

/// 全文・正規表現検索のレスポンス
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResponse {
    /// 一致したセル位置と値のリスト
    pub matches: Vec<SearchResult>,
    /// 検索にマッチした行番号のユニークリスト（昇順・フィルタ表示用）
    pub matched_row_indices: Vec<usize>,
    /// 一致した総件数
    pub total_matches: usize,
}

/// 仮想スクロール表示用のスライスレスポンス
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SliceResponse {
    /// 返却されたデータの開始行番号 (0-indexed)
    pub start_row: usize,
    /// 行データ配列（各行はセルの文字列配列）
    pub rows: Vec<Vec<String>>,
    /// 対象データセットの総行数（フィルタ時は絞り込み後件数）
    pub total_rows: usize,
    /// 各行の元CSVにおける物理行インデックス (0-indexed)
    pub original_row_indices: Vec<usize>,
}

/// ファイル分割（Split CSV）の実行結果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SplitResult {
    /// 生成された分割ファイル数
    pub chunk_count: usize,
    /// 生成されたファイル名一覧
    pub file_names: Vec<String>,
    /// 分割対象となった総行数
    pub total_rows: usize,
}
