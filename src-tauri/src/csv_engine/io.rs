// UPDATE 2026-08-26: [CsvEngine IO・ファイル操作モジュール]
// なぜ: メモリマップドファイル、文字コード判定/デコード/エンコード、ファイル保存・分割・生テキスト処理の単一責任管理のため。

//! # CsvEngine IO & ファイル操作モジュール

use super::types::{FileMetadata, SplitResult, SupportedEncoding, SupportedLineEnding};
use super::CsvEngine;
use memmap2::Mmap;
use std::fs::File;
use std::io::Write;
use std::path::Path;
use std::sync::Arc;

impl CsvEngine {
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
        let mut raw_headers = Vec::new();
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
                    raw_headers.push(field.to_string()); // 元の値（空文字列も保持）
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
        self.raw_headers = raw_headers;
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

    /// 行デコード
    pub(crate) fn get_decoded_line_at(&self, line_index: usize) -> anyhow::Result<String> {
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

    /// 生テキスト取得
    pub fn get_raw_text(&self, max_lines: Option<usize>) -> String {
        let delim_char = self.delimiter as char;
        let le = match self.line_ending {
            SupportedLineEnding::CRLF => "\r\n",
            SupportedLineEnding::LF => "\n",
        };

        // mmap ファイルがある場合は元ファイルの1行目をそのまま使う（最も正確）
        // in-memory の場合は raw_headers（置換前の元の値）を使う
        let limit = max_lines.unwrap_or(self.total_rows).min(self.total_rows);
        let mut output = String::new();

        if self.has_header {
            if self.mmap.is_some() && !self.line_offsets.is_empty() {
                // ファイルから直接読む（空文字列も正確に保持）
                if let Ok(first_line) = self.get_decoded_line_at(0) {
                    output.push_str(&first_line);
                    output.push_str(le);
                }
            } else if !self.raw_headers.is_empty() {
                // in-memory: raw_headers（空文字列保持）を使う
                let escape_cell = |s: &str| -> String {
                    if s.contains(delim_char) || s.contains('"') || s.contains('\n') {
                        format!("\"{}\"", s.replace('"', "\"\""))
                    } else {
                        s.to_string()
                    }
                };
                output.push_str(
                    &self
                        .raw_headers
                        .iter()
                        .map(|h| escape_cell(h))
                        .collect::<Vec<_>>()
                        .join(&delim_char.to_string()),
                );
                output.push_str(le);
            } else if !self.headers.is_empty() {
                // フォールバック: 表示用ヘッダー（Col N を含む可能性あり）
                output.push_str(&self.headers.join(&delim_char.to_string()));
                output.push_str(le);
            }
        }

        for row_idx in 0..limit {
            if let Ok(row_data) = self.get_row_data(row_idx) {
                output.push_str(&row_data.join(&delim_char.to_string()));
                output.push_str(le);
            }
        }

        output
    }

    /// 生テキスト文字列からテーブル全体を再パースして再構築
    pub fn update_from_text(
        &mut self,
        text: &str,
        custom_delimiter: Option<char>,
    ) -> anyhow::Result<FileMetadata> {
        let delim = match custom_delimiter {
            Some(c) => c as u8,
            None => self.delimiter,
        };
        self.delimiter = delim;

        let mut rdr = csv::ReaderBuilder::new()
            .delimiter(delim)
            .has_headers(false)
            .flexible(true)
            .from_reader(text.as_bytes());

        let mut all_rows = Vec::new();
        let mut max_cols = 0;

        for result in rdr.records() {
            let record = result?;
            let row: Vec<String> = record.iter().map(|s| s.to_string()).collect();
            max_cols = max_cols.max(row.len());
            all_rows.push(row);
        }

        let (headers, raw_headers, data_rows) = if self.has_header && !all_rows.is_empty() {
            let first_row = all_rows.remove(0);
            let raw = first_row.clone();
            let display: Vec<String> = first_row
                .into_iter()
                .enumerate()
                .map(|(i, f)| {
                    if f.trim().is_empty() {
                        format!("Col {}", i + 1)
                    } else {
                        f
                    }
                })
                .collect();
            (display, raw, all_rows)
        } else {
            let hdr: Vec<String> = (1..=max_cols.max(1)).map(|i| i.to_string()).collect();
            let raw = vec![String::new(); max_cols.max(1)];
            (hdr, raw, all_rows)
        };

        self.total_rows = data_rows.len();
        self.total_cols = max_cols.max(headers.len());
        self.headers = headers;
        self.raw_headers = raw_headers;
        self.in_memory_rows = Some(data_rows);
        self.modified_cells.clear();

        Ok(self.get_metadata())
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
