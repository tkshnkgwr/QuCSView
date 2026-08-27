// UPDATE 2026-08-26: [CsvEngine モジュールルート]
// なぜ: サブモジュールの統合、CsvEngine構造体定義、および公開APIの再エクスポートのため。

//! # QuCSView CSV/TSV 高速処理エンジン
//!
//! `csv_engine` は、低スペックPC環境（メモリ4GB以下のWindowsマシン等）において、
//! 500MB超の大規模CSV/TSVファイルを瞬時に読み込み・編集・検索・分割するためのネイティブコアモジュールです。
//!
//! ## 主な特徴
//! - **ゼロコピー メモリマップ (`memmap2`)**: ファイル全体をRAMに展開せず、OSのページキャッシュを利用して瞬時にオープン
//! - **行オフセットバイトインデックス**: 改行位置のみを事前スキャンし、画面に必要な30〜50行のみをオンデマンドにスライス返却
//! - **型安全＆文字列完全保護**: 数値型や日付型への暗黙の変換を一切行わず、先頭の `0`（ゼロ落ち）やハイフンを完全に維持
//! - **構造変更＆差分バッファ**: 行・列の追加/削除/複製およびセル直接編集を軽量に差分管理

pub mod grid;
pub mod io;
pub mod search;
pub mod types;

#[cfg(test)]
mod tests;

pub use types::*;

use memmap2::Mmap;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

/// 超高速 CSV/TSV 処理エンジン本体
pub struct CsvEngine {
    /// ロード中のファイルパス
    pub file_path: Option<PathBuf>,
    /// 区切り文字バイト（カンマ `b','` またはタブ `b'\t'`）
    pub delimiter: u8,
    /// 文字エンコーディング
    pub encoding: SupportedEncoding,
    /// 改行コード
    pub line_ending: SupportedLineEnding,
    /// 表示用ヘッダー文字列配列（空フィールドは "Col N" に置換済み）
    pub headers: Vec<String>,
    /// 元の生ヘッダー文字列配列（テキスト再構築時に使用、空フィールドは空文字列のまま保持）
    pub raw_headers: Vec<String>,
    /// 各行の開始バイト位置オフセット
    pub line_offsets: Vec<usize>,
    /// メモリマップハンドル
    pub mmap: Option<Arc<Mmap>>,
    /// 行構造変更後のオンメモリキャッシュ
    pub in_memory_rows: Option<Vec<Vec<String>>>,
    /// セル単位の直接編集差分マップ ((row, col) -> 新しい文字列値)
    pub modified_cells: HashMap<(usize, usize), String>,
    /// 総データ行数
    pub total_rows: usize,
    /// 総列数
    pub total_cols: usize,
    /// ヘッダー行有効フラグ
    pub has_header: bool,
}

impl Default for CsvEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl CsvEngine {
    /// 新規 `CsvEngine` インスタンスを生成
    pub fn new() -> Self {
        Self {
            file_path: None,
            delimiter: b',',
            encoding: SupportedEncoding::Utf8,
            line_ending: SupportedLineEnding::LF,
            headers: Vec::new(),
            raw_headers: Vec::new(),
            line_offsets: Vec::new(),
            mmap: None,
            in_memory_rows: None,
            modified_cells: HashMap::new(),
            total_rows: 0,
            total_cols: 0,
            has_header: true,
        }
    }
}
