// UPDATE 2026-08-26: [RustDocおよびユニットテストの追加]
// なぜ: Rustネイティブエンジンの保守性、API仕様の明文化、および低リソースWindows環境でのゼロコピー/型安全性を担保するため。

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

use memmap2::Mmap;
use regex::RegexBuilder;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;

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
    /// ヘッダー文字列配列
    pub headers: Vec<String>,
    /// 各行の開始バイト位置オフセット
    pub line_offsets: Vec<usize>,
    /// メモリマップハンドル
    pub mmap: Option<Arc<Mmap>>,
    /// 行構造変更後のオンメモリキャッシュ
    pub in_memory_rows: Option<Vec<Vec<String>>>,
    /// セル単位の直接編集差分マップ ((row, col) -> 新しい文字列値)
    pub modified_cells: std::collections::HashMap<(usize, usize), String>,
    /// 総データ行数
    pub total_rows: usize,
    /// 総列数
    pub total_cols: usize,
    /// ヘッダー行有効フラグ
    pub has_header: bool,
}

impl CsvEngine {
    pub fn new() -> Self {
        Self {
            file_path: None,
            delimiter: b',',
            encoding: SupportedEncoding::Utf8,
            line_ending: SupportedLineEnding::LF,
            headers: Vec::new(),
            line_offsets: Vec::new(),
            mmap: None,
            in_memory_rows: None,
            modified_cells: std::collections::HashMap::new(),
            total_rows: 0,
            total_cols: 0,
            has_header: true,
        }
    }

    /// ファイルのエンコーディングと改行コードを高速判定
    pub fn detect_format(bytes: &[u8]) -> (SupportedEncoding, SupportedLineEnding) {
        let encoding = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
            SupportedEncoding::Utf8Bom
        } else {
            let (_cow, _encoding_used, had_errors) = encoding_rs::UTF_8.decode(bytes);
            if !had_errors {
                SupportedEncoding::Utf8
            } else {
                let (_, _, sjis_errors) = encoding_rs::SHIFT_JIS.decode(bytes);
                if !sjis_errors {
                    SupportedEncoding::ShiftJis
                } else {
                    SupportedEncoding::EucJp
                }
            }
        };

        let mut has_crlf = false;
        for i in 0..bytes.len().saturating_sub(1) {
            if bytes[i] == b'\r' && bytes[i + 1] == b'\n' {
                has_crlf = true;
                break;
            }
        }
        let line_ending = if has_crlf {
            SupportedLineEnding::CRLF
        } else {
            SupportedLineEnding::LF
        };

        (encoding, line_ending)
    }

    /// ファイルをオープンし、行オフセットインデックスを構築
    pub fn open_file<P: AsRef<Path>>(
        &mut self,
        path: P,
        custom_delimiter: Option<char>,
    ) -> anyhow::Result<FileMetadata> {
        let start_time = std::time::Instant::now();
        let path_ref = path.as_ref();
        let file = File::open(path_ref)?;
        let file_size = file.metadata()?.len();

        let mmap = unsafe { Mmap::map(&file)? };
        let (detected_encoding, detected_le) = Self::detect_format(&mmap[..mmap.len().min(8192)]);

        let delimiter = match custom_delimiter {
            Some(c) => c as u8,
            None => {
                if path_ref.extension().is_some_and(|ext| ext == "tsv") {
                    b'\t'
                } else {
                    b','
                }
            }
        };

        // 行頭バイトオフセットをスキャン
        let mut offsets = Vec::new();
        let mut in_quote = false;
        let mut at_start_of_line = true;
        let mut i = 0;
        let len = mmap.len();

        if len >= 3 && mmap[0] == 0xEF && mmap[1] == 0xBB && mmap[2] == 0xBF {
            i = 3;
        }

        while i < len {
            if at_start_of_line {
                offsets.push(i);
                at_start_of_line = false;
            }

            let byte = mmap[i];
            if byte == b'"' {
                in_quote = !in_quote;
            } else if !in_quote && byte == b'\n' {
                at_start_of_line = true;
            }
            i += 1;
        }

        self.file_path = Some(path_ref.to_path_buf());
        self.delimiter = delimiter;
        self.encoding = detected_encoding.clone();
        self.line_ending = detected_le.clone();
        self.mmap = Some(Arc::new(mmap));
        self.in_memory_rows = None;
        self.line_offsets = offsets;
        self.modified_cells.clear();

        // ヘッダー行のデコードとパース
        let mut headers = Vec::new();
        let mut total_cols = 0;
        if !self.line_offsets.is_empty() {
            let header_row_slice = self.get_decoded_line_at(0)?;
            let mut rdr = csv::ReaderBuilder::new()
                .delimiter(self.delimiter)
                .has_headers(false)
                .from_reader(header_row_slice.as_bytes());

            if let Some(result) = rdr.records().next() {
                let record = result?;
                total_cols = record.len();
                for (idx, field) in record.iter().enumerate() {
                    let field_name = if field.trim().is_empty() {
                        format!("Col {}", idx + 1)
                    } else {
                        field.to_string()
                    };
                    headers.push(field_name);
                }
            }
        }

        let total_rows = if self.line_offsets.is_empty() {
            0
        } else {
            self.line_offsets.len() - 1
        };
        self.headers = headers.clone();
        self.total_rows = total_rows;
        self.total_cols = total_cols;
        self.has_header = true;

        let load_time_ms = start_time.elapsed().as_millis() as u64;

        Ok(FileMetadata {
            file_name: path_ref
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            file_path: Some(path_ref.to_string_lossy().to_string()),
            file_size,
            total_rows,
            total_cols,
            headers,
            encoding: detected_encoding,
            line_ending: detected_le,
            delimiter: delimiter as char,
            is_dirty: false,
            load_time_ms,
            has_header: true,
        })
    }

    /// ヘッダーの有無を切替
    pub fn set_has_header(&mut self, has_header: bool) -> anyhow::Result<FileMetadata> {
        self.has_header = has_header;
        let total_lines = self.line_offsets.len();

        if !has_header {
            self.total_rows = total_lines;
            self.headers = (1..=self.total_cols.max(1))
                .map(|i| format!("Col {}", i))
                .collect();
        } else {
            self.total_rows = if total_lines > 0 { total_lines - 1 } else { 0 };
            let mut headers = Vec::new();
            if !self.line_offsets.is_empty() {
                let header_row_slice = self.get_decoded_line_at(0)?;
                let mut rdr = csv::ReaderBuilder::new()
                    .delimiter(self.delimiter)
                    .has_headers(false)
                    .from_reader(header_row_slice.as_bytes());
                if let Some(result) = rdr.records().next() {
                    let record = result?;
                    for (idx, field) in record.iter().enumerate() {
                        let field_name = if field.trim().is_empty() {
                            format!("Col {}", idx + 1)
                        } else {
                            field.to_string()
                        };
                        headers.push(field_name);
                    }
                }
            }
            self.headers = headers;
        }

        Ok(FileMetadata {
            file_name: self
                .file_path
                .as_ref()
                .and_then(|p| p.file_name())
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            file_path: self
                .file_path
                .as_ref()
                .map(|p| p.to_string_lossy().to_string()),
            file_size: 0,
            total_rows: self.total_rows,
            total_cols: self.total_cols,
            headers: self.headers.clone(),
            encoding: self.encoding.clone(),
            line_ending: self.line_ending.clone(),
            delimiter: self.delimiter as char,
            is_dirty: !self.modified_cells.is_empty(),
            load_time_ms: 0,
            has_header: self.has_header,
        })
    }

    /// 行デコード
    fn get_decoded_line_at(&self, line_index: usize) -> anyhow::Result<String> {
        let mmap = self
            .mmap
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("No file loaded"))?;
        if line_index >= self.line_offsets.len() {
            return Ok(String::new());
        }

        let start = self.line_offsets[line_index];
        let end = if line_index + 1 < self.line_offsets.len() {
            self.line_offsets[line_index + 1]
        } else {
            mmap.len()
        };

        let raw_bytes = &mmap[start..end];
        let decoded = match self.encoding {
            SupportedEncoding::Utf8 | SupportedEncoding::Utf8Bom => {
                String::from_utf8_lossy(raw_bytes).to_string()
            }
            SupportedEncoding::ShiftJis => {
                let (cow, _, _) = encoding_rs::SHIFT_JIS.decode(raw_bytes);
                cow.into_owned()
            }
            SupportedEncoding::EucJp => {
                let (cow, _, _) = encoding_rs::EUC_JP.decode(raw_bytes);
                cow.into_owned()
            }
        };

        Ok(decoded)
    }

    /// 行配列のロード（構造変更時用）
    fn ensure_in_memory_rows(&mut self) -> anyhow::Result<&mut Vec<Vec<String>>> {
        if self.in_memory_rows.is_none() {
            let mut all_rows = Vec::with_capacity(self.total_rows);
            for row_idx in 0..self.total_rows {
                let line_offset_idx = if self.has_header {
                    row_idx + 1
                } else {
                    row_idx
                };
                let line_str = self.get_decoded_line_at(line_offset_idx)?;
                let mut rdr = csv::ReaderBuilder::new()
                    .delimiter(self.delimiter)
                    .has_headers(false)
                    .from_reader(line_str.as_bytes());

                let mut row_cells: Vec<String> = match rdr.records().next() {
                    Some(Ok(record)) => record.iter().map(|s| s.to_string()).collect(),
                    _ => vec![String::new(); self.total_cols],
                };

                while row_cells.len() < self.total_cols {
                    row_cells.push(String::new());
                }

                // 編集済みセルを反映
                for col_idx in 0..self.total_cols {
                    if let Some(modified_val) = self.modified_cells.get(&(row_idx, col_idx)) {
                        if col_idx < row_cells.len() {
                            row_cells[col_idx] = modified_val.clone();
                        }
                    }
                }
                all_rows.push(row_cells);
            }
            self.in_memory_rows = Some(all_rows);
            self.modified_cells.clear();
        }
        Ok(self.in_memory_rows.as_mut().unwrap())
    }

    /// 仮想スクロール用スライス取得 (30-50行)
    pub fn get_rows_slice(
        &mut self,
        start_row: usize,
        count: usize,
        filter_indices: Option<&[usize]>,
        _sort_config: Option<&SortConfig>,
    ) -> anyhow::Result<SliceResponse> {
        if self.total_rows == 0 {
            return Ok(SliceResponse {
                start_row: 0,
                rows: Vec::new(),
                total_rows: 0,
                original_row_indices: Vec::new(),
            });
        }

        // フィルタ指定時
        if let Some(indices) = filter_indices {
            let total = indices.len();
            let actual_start = start_row.min(total);
            let actual_end = (actual_start + count).min(total);
            let mut rows = Vec::with_capacity(actual_end - actual_start);
            let mut orig_indices = Vec::with_capacity(actual_end - actual_start);

            for &orig_row_idx in &indices[actual_start..actual_end] {
                let row_cells = self.get_row_data(orig_row_idx)?;
                rows.push(row_cells);
                orig_indices.push(orig_row_idx);
            }

            return Ok(SliceResponse {
                start_row: actual_start,
                rows,
                total_rows: total,
                original_row_indices: orig_indices,
            });
        }

        // 通常表示
        let actual_start = start_row.min(self.total_rows);
        let actual_end = (actual_start + count).min(self.total_rows);
        let mut rows = Vec::with_capacity(actual_end - actual_start);
        let mut orig_indices = Vec::with_capacity(actual_end - actual_start);

        for row_idx in actual_start..actual_end {
            let row_cells = self.get_row_data(row_idx)?;
            rows.push(row_cells);
            orig_indices.push(row_idx);
        }

        Ok(SliceResponse {
            start_row: actual_start,
            rows,
            total_rows: self.total_rows,
            original_row_indices: orig_indices,
        })
    }

    pub fn get_row_data(&self, row_idx: usize) -> anyhow::Result<Vec<String>> {
        if let Some(ref mem_rows) = self.in_memory_rows {
            if row_idx < mem_rows.len() {
                return Ok(mem_rows[row_idx].clone());
            }
        }

        let line_offset_idx = if self.has_header {
            row_idx + 1
        } else {
            row_idx
        };
        let line_str = self.get_decoded_line_at(line_offset_idx)?;
        let mut rdr = csv::ReaderBuilder::new()
            .delimiter(self.delimiter)
            .has_headers(false)
            .from_reader(line_str.as_bytes());

        let mut row_cells: Vec<String> = match rdr.records().next() {
            Some(Ok(record)) => record.iter().map(|s| s.to_string()).collect(),
            _ => vec![String::new(); self.total_cols],
        };

        while row_cells.len() < self.total_cols {
            row_cells.push(String::new());
        }

        for col_idx in 0..self.total_cols {
            if let Some(modified_val) = self.modified_cells.get(&(row_idx, col_idx)) {
                if col_idx < row_cells.len() {
                    row_cells[col_idx] = modified_val.clone();
                }
            }
        }

        Ok(row_cells)
    }

    /// 単一セル値取得
    pub fn get_cell_value(&self, row: usize, col: usize) -> String {
        if let Some(ref mem_rows) = self.in_memory_rows {
            if row < mem_rows.len() && col < mem_rows[row].len() {
                return mem_rows[row][col].clone();
            }
        }
        if let Some(val) = self.modified_cells.get(&(row, col)) {
            return val.clone();
        }
        if let Ok(row_data) = self.get_row_data(row) {
            if col < row_data.len() {
                return row_data[col].clone();
            }
        }
        String::new()
    }

    /// セル直接編集
    pub fn update_cell(&mut self, row_idx: usize, col_idx: usize, new_value: String) -> bool {
        if row_idx < self.total_rows && col_idx < self.total_cols {
            if let Some(ref mut mem_rows) = self.in_memory_rows {
                if row_idx < mem_rows.len() && col_idx < mem_rows[row_idx].len() {
                    mem_rows[row_idx][col_idx] = new_value;
                    return true;
                }
            }
            self.modified_cells.insert((row_idx, col_idx), new_value);
            true
        } else {
            false
        }
    }

    // --- 構造編集 (行/列の挿入・複製・削除) ---

    pub fn insert_row(
        &mut self,
        row_idx: usize,
        row_data: Option<Vec<String>>,
    ) -> anyhow::Result<FileMetadata> {
        let cols = self.total_cols;
        let data = row_data.unwrap_or_else(|| vec![String::new(); cols]);
        let mem_rows = self.ensure_in_memory_rows()?;
        let target_idx = row_idx.min(mem_rows.len());
        mem_rows.insert(target_idx, data);
        self.total_rows = mem_rows.len();

        Ok(self.get_metadata())
    }

    pub fn delete_row(&mut self, row_idx: usize) -> anyhow::Result<(Vec<String>, usize)> {
        let mem_rows = self.ensure_in_memory_rows()?;
        if row_idx < mem_rows.len() {
            let deleted = mem_rows.remove(row_idx);
            self.total_rows = mem_rows.len();
            Ok((deleted, self.total_rows))
        } else {
            anyhow::bail!("Row index out of bounds");
        }
    }

    pub fn duplicate_row(
        &mut self,
        source_row: usize,
        target_row: Option<usize>,
    ) -> anyhow::Result<(usize, Vec<String>, usize)> {
        let source_data = self.get_row_data(source_row)?;
        let mem_rows = self.ensure_in_memory_rows()?;
        let insert_idx = target_row.unwrap_or(source_row + 1).min(mem_rows.len());
        mem_rows.insert(insert_idx, source_data.clone());
        self.total_rows = mem_rows.len();
        Ok((insert_idx, source_data, self.total_rows))
    }

    pub fn insert_col(
        &mut self,
        col_idx: usize,
        header_name: Option<String>,
    ) -> anyhow::Result<FileMetadata> {
        let target_col = col_idx.min(self.total_cols);
        let header = header_name.unwrap_or_else(|| format!("Col {}", target_col + 1));
        let mem_rows = self.ensure_in_memory_rows()?;
        for row in mem_rows.iter_mut() {
            row.insert(target_col, String::new());
        }
        self.headers.insert(target_col, header);
        self.total_cols += 1;

        Ok(self.get_metadata())
    }

    pub fn delete_col(
        &mut self,
        col_idx: usize,
    ) -> anyhow::Result<(String, Vec<String>, usize, Vec<String>)> {
        if self.total_cols <= 1 {
            anyhow::bail!("Cannot delete the only column");
        }
        let mem_rows = self.ensure_in_memory_rows()?;
        let mut deleted_values = Vec::with_capacity(mem_rows.len());
        for row in mem_rows.iter_mut() {
            if col_idx < row.len() {
                deleted_values.push(row.remove(col_idx));
            }
        }
        let deleted_header = if col_idx < self.headers.len() {
            self.headers.remove(col_idx)
        } else {
            String::new()
        };
        self.total_cols -= 1;

        Ok((
            deleted_header,
            deleted_values,
            self.total_cols,
            self.headers.clone(),
        ))
    }

    #[allow(clippy::type_complexity)]
    pub fn duplicate_col(
        &mut self,
        source_col: usize,
        target_col: Option<usize>,
        header_name: Option<String>,
    ) -> anyhow::Result<(usize, String, Vec<String>, usize, Vec<String>)> {
        let insert_idx = target_col.unwrap_or(source_col + 1).min(self.total_cols);
        let header = header_name.unwrap_or_else(|| {
            let base = if source_col < self.headers.len() {
                &self.headers[source_col]
            } else {
                "Col"
            };
            format!("{}_Copy", base)
        });
        let mem_rows = self.ensure_in_memory_rows()?;
        let mut col_values = Vec::with_capacity(mem_rows.len());

        for row in mem_rows.iter_mut() {
            let val = if source_col < row.len() {
                row[source_col].clone()
            } else {
                String::new()
            };
            col_values.push(val.clone());
            row.insert(insert_idx, val);
        }

        self.headers.insert(insert_idx, header.clone());
        self.total_cols += 1;

        Ok((
            insert_idx,
            header,
            col_values,
            self.total_cols,
            self.headers.clone(),
        ))
    }

    pub fn get_metadata(&self) -> FileMetadata {
        FileMetadata {
            file_name: self
                .file_path
                .as_ref()
                .and_then(|p| p.file_name())
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            file_path: self
                .file_path
                .as_ref()
                .map(|p| p.to_string_lossy().to_string()),
            file_size: 0,
            total_rows: self.total_rows,
            total_cols: self.total_cols,
            headers: self.headers.clone(),
            encoding: self.encoding.clone(),
            line_ending: self.line_ending.clone(),
            delimiter: self.delimiter as char,
            is_dirty: self.in_memory_rows.is_some() || !self.modified_cells.is_empty(),
            load_time_ms: 0,
            has_header: self.has_header,
        }
    }

    /// 高速正規表現・全文検索
    pub fn search(
        &self,
        query: &str,
        case_sensitive: bool,
        use_regex: bool,
        col_filter: Option<usize>,
    ) -> SearchResponse {
        let mut matches = Vec::new();
        let mut matched_rows = std::collections::HashSet::new();
        if query.is_empty() || self.total_rows == 0 {
            return SearchResponse {
                matches: Vec::new(),
                matched_row_indices: Vec::new(),
                total_matches: 0,
            };
        }

        let regex_opt = if use_regex {
            RegexBuilder::new(query)
                .case_insensitive(!case_sensitive)
                .build()
                .ok()
        } else {
            None
        };

        let query_lower = query.to_lowercase();

        for row_idx in 0..self.total_rows {
            if let Ok(row_cells) = self.get_row_data(row_idx) {
                for (col_idx, cell_val) in row_cells.iter().enumerate() {
                    if let Some(filter_col) = col_filter {
                        if col_idx != filter_col {
                            continue;
                        }
                    }

                    let is_match = if let Some(ref re) = regex_opt {
                        re.is_match(cell_val)
                    } else if case_sensitive {
                        cell_val.contains(query)
                    } else {
                        cell_val.to_lowercase().contains(&query_lower)
                    };

                    if is_match {
                        matches.push(SearchResult {
                            row: row_idx,
                            col: col_idx,
                            value: cell_val.clone(),
                        });
                        matched_rows.insert(row_idx);
                        if matches.len() >= 5000 {
                            break;
                        }
                    }
                }
            }
            if matches.len() >= 5000 {
                break;
            }
        }

        let mut sorted_rows: Vec<usize> = matched_rows.into_iter().collect();
        sorted_rows.sort_unstable();

        let total = matches.len();
        SearchResponse {
            matches,
            matched_row_indices: sorted_rows,
            total_matches: total,
        }
    }

    /// 大容量CSVの高速分割 (Split CSV)
    pub fn split_csv(
        &self,
        chunk_size: usize,
        out_dir: &Path,
        prefix: &str,
        include_header: bool,
    ) -> anyhow::Result<SplitResult> {
        let chunk_size = chunk_size.max(1);
        let total_chunks = self.total_rows.div_ceil(chunk_size);
        let mut file_names = Vec::with_capacity(total_chunks);

        let delim_char = self.delimiter as char;
        let le = match self.line_ending {
            SupportedLineEnding::CRLF => "\r\n",
            SupportedLineEnding::LF => "\n",
        };

        for chunk_idx in 0..total_chunks {
            let start = chunk_idx * chunk_size;
            let end = (start + chunk_size).min(self.total_rows);
            let file_name = format!("{}_part_{:03}.csv", prefix, chunk_idx + 1);
            let file_path = out_dir.join(&file_name);
            let mut file = File::create(&file_path)?;

            if include_header && !self.headers.is_empty() {
                let header_line = self.headers.join(&delim_char.to_string()) + le;
                file.write_all(header_line.as_bytes())?;
            }

            for row_idx in start..end {
                let row_data = self.get_row_data(row_idx)?;
                let row_line = row_data.join(&delim_char.to_string()) + le;
                file.write_all(row_line.as_bytes())?;
            }

            file_names.push(file_name);
        }

        Ok(SplitResult {
            chunk_count: total_chunks,
            file_names,
            total_rows: self.total_rows,
        })
    }

    /// 生テキスト取得
    pub fn get_raw_text(&self, max_lines: Option<usize>) -> String {
        let delim_char = self.delimiter as char;
        let le = match self.line_ending {
            SupportedLineEnding::CRLF => "\r\n",
            SupportedLineEnding::LF => "\n",
        };

        let limit = max_lines.unwrap_or(self.total_rows).min(self.total_rows);
        let mut output = String::new();

        if self.has_header && !self.headers.is_empty() {
            output.push_str(&self.headers.join(&delim_char.to_string()));
            output.push_str(le);
        }

        for row_idx in 0..limit {
            if let Ok(row_data) = self.get_row_data(row_idx) {
                output.push_str(&row_data.join(&delim_char.to_string()));
                output.push_str(le);
            }
        }

        output
    }

    /// 指定エンコーディングと改行コード、区切り文字でファイル保存
    pub fn save_to_file<P: AsRef<Path>>(
        &self,
        path: P,
        encoding: SupportedEncoding,
        line_ending: SupportedLineEnding,
        custom_delimiter: Option<u8>,
    ) -> anyhow::Result<()> {
        let mut file = File::create(path)?;
        let out_delim = custom_delimiter.unwrap_or(self.delimiter);
        let le_str = match line_ending {
            SupportedLineEnding::CRLF => "\r\n",
            SupportedLineEnding::LF => "\n",
        };

        if matches!(encoding, SupportedEncoding::Utf8Bom) {
            file.write_all(&[0xEF, 0xBB, 0xBF])?;
        }

        let mut write_row = |cells: &[String]| -> anyhow::Result<()> {
            let mut line = String::new();
            for (idx, cell) in cells.iter().enumerate() {
                if idx > 0 {
                    line.push(out_delim as char);
                }
                if cell.contains(out_delim as char)
                    || cell.contains('"')
                    || cell.contains('\n')
                    || cell.contains('\r')
                {
                    line.push('"');
                    line.push_str(&cell.replace('"', "\"\""));
                    line.push('"');
                } else {
                    line.push_str(cell);
                }
            }
            line.push_str(le_str);

            match encoding {
                SupportedEncoding::Utf8 => {
                    file.write_all(line.as_bytes())?;
                }
                SupportedEncoding::Utf8Bom => {
                    file.write_all(line.as_bytes())?;
                }
                SupportedEncoding::ShiftJis => {
                    let (cow, _, _) = encoding_rs::SHIFT_JIS.encode(&line);
                    file.write_all(&cow)?;
                }
                SupportedEncoding::EucJp => {
                    let (cow, _, _) = encoding_rs::EUC_JP.encode(&line);
                    file.write_all(&cow)?;
                }
            }
            Ok(())
        };

        if self.has_header && !self.headers.is_empty() {
            write_row(&self.headers)?;
        }

        for row_idx in 0..self.total_rows {
            let row_cells = self.get_row_data(row_idx)?;
            write_row(&row_cells)?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn create_test_csv(content: &str) -> NamedTempFile {
        let mut file = NamedTempFile::new().expect("Failed to create temp file");
        file.write_all(content.as_bytes())
            .expect("Failed to write to temp file");
        file
    }

    #[test]
    fn test_open_csv_and_preserve_leading_zero() {
        let csv_data = "ID,Code,Name\r\n001,000123,Tanaka\r\n002,000456,Sato\r\n";
        let temp_file = create_test_csv(csv_data);

        let mut engine = CsvEngine::new();
        let metadata = engine
            .open_file(temp_file.path(), None)
            .expect("Failed to open CSV");

        assert_eq!(metadata.total_rows, 2);
        assert_eq!(metadata.total_cols, 3);
        assert_eq!(metadata.headers, vec!["ID", "Code", "Name"]);
        assert_eq!(metadata.delimiter, ',');
        assert_eq!(metadata.line_ending, SupportedLineEnding::CRLF);

        let slice = engine
            .get_rows_slice(0, 10, None, None)
            .expect("Failed to get slice");
        assert_eq!(slice.rows.len(), 2);
        assert_eq!(slice.rows[0][0], "001");
        assert_eq!(slice.rows[0][1], "000123");
        assert_eq!(slice.rows[0][2], "Tanaka");
    }

    #[test]
    fn test_cell_editing_and_rollback() {
        let csv_data = "ID,Name\r\n101,Taro\r\n102,Jiro\r\n";
        let temp_file = create_test_csv(csv_data);

        let mut engine = CsvEngine::new();
        engine.open_file(temp_file.path(), None).unwrap();

        assert_eq!(engine.get_cell_value(0, 1), "Taro");
        assert!(engine.update_cell(0, 1, "Saburo".to_string()));
        assert_eq!(engine.get_cell_value(0, 1), "Saburo");

        let slice = engine.get_rows_slice(0, 10, None, None).unwrap();
        assert_eq!(slice.rows[0][1], "Saburo");
    }

    #[test]
    fn test_insert_and_delete_row() {
        let csv_data = "Col1,Col2\r\nA,B\r\nC,D\r\n";
        let temp_file = create_test_csv(csv_data);

        let mut engine = CsvEngine::new();
        engine.open_file(temp_file.path(), None).unwrap();

        assert_eq!(engine.total_rows, 2);

        // 行挿入
        engine
            .insert_row(1, Some(vec!["NEW1".to_string(), "NEW2".to_string()]))
            .unwrap();
        assert_eq!(engine.total_rows, 3);
        assert_eq!(engine.get_row_data(1).unwrap(), vec!["NEW1", "NEW2"]);

        // 行削除
        let (deleted, total) = engine.delete_row(1).unwrap();
        assert_eq!(deleted, vec!["NEW1", "NEW2"]);
        assert_eq!(total, 2);
        assert_eq!(engine.get_row_data(1).unwrap(), vec!["C", "D"]);
    }

    #[test]
    fn test_insert_and_delete_col() {
        let csv_data = "H1,H2\r\n1,2\r\n3,4\r\n";
        let temp_file = create_test_csv(csv_data);

        let mut engine = CsvEngine::new();
        engine.open_file(temp_file.path(), None).unwrap();

        assert_eq!(engine.total_cols, 2);

        // 列挿入
        engine.insert_col(1, Some("H_NEW".to_string())).unwrap();
        assert_eq!(engine.total_cols, 3);
        assert_eq!(engine.headers, vec!["H1", "H_NEW", "H2"]);

        // 列削除
        let (deleted_header, _deleted_vals, total_cols, headers) = engine.delete_col(1).unwrap();
        assert_eq!(deleted_header, "H_NEW");
        assert_eq!(total_cols, 2);
        assert_eq!(headers, vec!["H1", "H2"]);
    }

    #[test]
    fn test_regex_search() {
        let csv_data =
            "ID,Postal,Note\r\n1,060-0001,Hokkaido\r\n2,100-0001,Tokyo\r\n3,ABC-DEFG,Invalid\r\n";
        let temp_file = create_test_csv(csv_data);

        let mut engine = CsvEngine::new();
        engine.open_file(temp_file.path(), None).unwrap();

        // 郵便番号形式の正規表現検索
        let res = engine.search(r"^\d{3}-\d{4}$", true, true, None);
        assert_eq!(res.total_matches, 2);
        assert_eq!(res.matched_row_indices, vec![0, 1]);
        assert_eq!(res.matches[0].value, "060-0001");
        assert_eq!(res.matches[1].value, "100-0001");
    }

    #[test]
    fn test_split_csv() {
        let csv_data = "ID,Val\r\n1,A\r\n2,B\r\n3,C\r\n4,D\r\n5,E\r\n";
        let temp_file = create_test_csv(csv_data);

        let mut engine = CsvEngine::new();
        engine.open_file(temp_file.path(), None).unwrap();

        let out_dir = tempfile::tempdir().unwrap();
        let split_res = engine
            .split_csv(2, out_dir.path(), "test_split", true)
            .unwrap();

        assert_eq!(split_res.chunk_count, 3);
        assert_eq!(split_res.total_rows, 5);
        assert_eq!(split_res.file_names.len(), 3);
    }
}
