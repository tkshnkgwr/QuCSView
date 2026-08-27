// UPDATE 2026-08-26: [CsvEngine グリッド & 構造編集操作モジュール]
// なぜ: スライス抽出、セル編集、行/列の挿入・複製・削除、TSV範囲抽出等のテーブル操作を単一責任管理するため。

//! # CsvEngine グリッド & 構造編集操作モジュール

use super::types::{FileMetadata, SliceResponse, SortConfig, SupportedEncoding};
use super::CsvEngine;

impl CsvEngine {
    /// ヘッダーの有無を切替
    pub fn set_has_header(&mut self, has_header: bool) -> anyhow::Result<FileMetadata> {
        if self.has_header == has_header {
            return Ok(self.get_metadata());
        }

        self.has_header = has_header;
        self.modified_cells.clear();

        // 1. インメモリ行が存在する場合（サンプルデータ・テキスト編集後・構造変更後）
        if let Some(rows) = &mut self.in_memory_rows {
            if !has_header {
                // ヘッダーなしにする: raw_headers（元の値）をデータ行先頭に戻す
                // raw_headers が空なら表示用 headers を使う（フォールバック）
                let restored = if !self.raw_headers.is_empty() {
                    std::mem::take(&mut self.raw_headers)
                } else {
                    std::mem::take(&mut self.headers)
                };
                self.headers = (1..=self.total_cols.max(1))
                    .map(|i| i.to_string())
                    .collect();
                self.raw_headers = Vec::new();
                rows.insert(0, restored);
                self.total_rows = rows.len();
            } else {
                // ヘッダーありにする: データ行の先頭 (0行目) を抜き出してヘッダーにする
                if !rows.is_empty() {
                    let first_row = rows.remove(0);
                    self.raw_headers = first_row.clone(); // 元の値を保持
                    self.headers = first_row
                        .into_iter()
                        .enumerate()
                        .map(|(idx, field)| {
                            if field.trim().is_empty() {
                                format!("Col {}", idx + 1)
                            } else {
                                field
                            }
                        })
                        .collect();
                }
                self.total_rows = rows.len();
            }
        } else {
            // 2. メモリマップドファイル走査の場合（ファイルから直接再パース）
            let total_lines = self.line_offsets.len();

            if !has_header {
                self.total_rows = total_lines;
                self.headers = (1..=self.total_cols.max(1))
                    .map(|i| i.to_string())
                    .collect();
                self.raw_headers = Vec::new();
            } else {
                self.total_rows = total_lines.saturating_sub(1);
                let mut headers = Vec::new();
                let mut raw_headers = Vec::new();
                if !self.line_offsets.is_empty() {
                    let header_row_slice = self.get_decoded_line_at(0)?;
                    let mut rdr = csv::ReaderBuilder::new()
                        .delimiter(self.delimiter)
                        .has_headers(false)
                        .from_reader(header_row_slice.as_bytes());
                    if let Some(result) = rdr.records().next() {
                        let record = result?;
                        for (idx, field) in record.iter().enumerate() {
                            raw_headers.push(field.to_string());
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
                self.raw_headers = raw_headers;
            }
        }

        Ok(self.get_metadata())
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

    /// 指定行の全セルデータを取得
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

    /// 行の挿入
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

    /// 行の削除
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

    /// 行の複製
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

    /// 列の挿入
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

    /// 列の削除
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

    /// 列の複製
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

    /// メタデータ取得
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

    /// 選択範囲のセルデータをTSV（タブ区切り）形式の文字列として高速抽出
    pub fn get_range_tsv(
        &self,
        start_row: usize,
        end_row: usize,
        start_col: usize,
        end_col: usize,
        filter_indices: Option<&[usize]>,
        _sort_config: Option<&SortConfig>,
    ) -> anyhow::Result<(String, usize, usize)> {
        let (row_indices, total_r) = if let Some(indices) = filter_indices {
            let actual_start = start_row.min(indices.len());
            let actual_end = (end_row + 1).min(indices.len());
            let rows: Vec<usize> = if actual_start < actual_end {
                indices[actual_start..actual_end].to_vec()
            } else {
                Vec::new()
            };
            let count = rows.len();
            (rows, count)
        } else {
            let actual_start = start_row.min(self.total_rows);
            let actual_end = (end_row + 1).min(self.total_rows);
            let rows: Vec<usize> = (actual_start..actual_end).collect();
            let count = rows.len();
            (rows, count)
        };

        let col_start = start_col.min(self.total_cols);
        let col_end = (end_col + 1).min(self.total_cols);
        let col_count = col_end.saturating_sub(col_start);

        let mut tsv_output = String::new();
        for (r_idx, &orig_r) in row_indices.iter().enumerate() {
            if r_idx > 0 {
                tsv_output.push('\n');
            }
            if let Ok(row_data) = self.get_row_data(orig_r) {
                let mut first_c = true;
                for c in col_start..col_end {
                    if !first_c {
                        tsv_output.push('\t');
                    }
                    first_c = false;
                    if c < row_data.len() {
                        tsv_output.push_str(&row_data[c]);
                    }
                }
            }
        }

        Ok((tsv_output, total_r, col_count))
    }

    /// エンコーディングおよび区切り文字を再設定してテーブルを再デコード
    pub fn set_encoding(
        &mut self,
        encoding: SupportedEncoding,
        custom_delimiter: Option<char>,
    ) -> anyhow::Result<FileMetadata> {
        self.encoding = encoding;
        if let Some(c) = custom_delimiter {
            self.delimiter = c as u8;
        }

        // 1. 実ファイルパスが存在する場合、指定のエンコーディングで完全に開き直す
        if let Some(path) = self.file_path.clone() {
            return self.open_file(&path, custom_delimiter);
        }

        // 2. インメモリ行（サンプルデータ・生テキスト等）の場合
        // インメモリ行データは既にUTF-8文字列として保持されているため、データを破棄せずメタデータを更新
        self.modified_cells.clear();
        Ok(self.get_metadata())
    }

    /// 1列分の全行セルデータを取得
    pub fn get_col_data(&self, col_idx: usize) -> Vec<String> {
        let mut col_data = Vec::with_capacity(self.total_rows);
        for row_idx in 0..self.total_rows {
            col_data.push(self.get_cell_value(row_idx, col_idx));
        }
        col_data
    }

    /// 未保存セル変更状態をクリア
    pub fn clear_modified_cells(&mut self) -> bool {
        self.modified_cells.clear();
        true
    }
}
