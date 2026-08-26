// UPDATE 2026-08-26: [CsvEngine 検索エンジンモジュール]
// なぜ: 全文検索、PCRE互換正規表現検索、カラムフィルタリング処理の単一責任管理のため。

//! # CsvEngine 検索エンジンモジュール

use super::types::{ReplaceAllResponse, ReplaceResult, SearchResponse, SearchResult};
use super::CsvEngine;
use regex::RegexBuilder;

impl CsvEngine {
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

    /// 単一セルの文字列置換
    pub fn replace_cell(
        &mut self,
        row_idx: usize,
        col_idx: usize,
        query: &str,
        replacement: &str,
        case_sensitive: bool,
        use_regex: bool,
    ) -> Option<ReplaceResult> {
        let current_val = self.get_cell_value(row_idx, col_idx);
        if query.is_empty() {
            return None;
        }

        let new_val = if use_regex {
            let re = RegexBuilder::new(query)
                .case_insensitive(!case_sensitive)
                .build()
                .ok()?;
            re.replace_all(&current_val, replacement).to_string()
        } else if case_sensitive {
            current_val.replace(query, replacement)
        } else {
            // 大文字小文字を区別しない通常文字列置換
            let mut result = String::new();
            let lower_val = current_val.to_lowercase();
            let lower_query = query.to_lowercase();
            let mut last_idx = 0;

            while let Some(match_pos) = lower_val[last_idx..].find(&lower_query) {
                let abs_pos = last_idx + match_pos;
                result.push_str(&current_val[last_idx..abs_pos]);
                result.push_str(replacement);
                last_idx = abs_pos + query.len();
            }
            result.push_str(&current_val[last_idx..]);
            result
        };

        if new_val != current_val {
            self.update_cell(row_idx, col_idx, new_val.clone());
            Some(ReplaceResult {
                row: row_idx,
                col: col_idx,
                prev_value: current_val,
                new_value: new_val,
            })
        } else {
            None
        }
    }

    /// 全文または特定列の一括文字列置換 (Replace All)
    pub fn replace_all(
        &mut self,
        query: &str,
        replacement: &str,
        case_sensitive: bool,
        use_regex: bool,
        col_filter: Option<usize>,
    ) -> ReplaceAllResponse {
        let mut changes = Vec::new();
        if query.is_empty() || self.total_rows == 0 {
            return ReplaceAllResponse {
                replaced_count: 0,
                changes,
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
            let cols_to_check = if let Some(target_col) = col_filter {
                if target_col < self.total_cols {
                    vec![target_col]
                } else {
                    Vec::new()
                }
            } else {
                (0..self.total_cols).collect()
            };

            for col_idx in cols_to_check {
                let cell_val = self.get_cell_value(row_idx, col_idx);
                let new_val = if let Some(ref re) = regex_opt {
                    if re.is_match(&cell_val) {
                        re.replace_all(&cell_val, replacement).to_string()
                    } else {
                        cell_val.clone()
                    }
                } else if case_sensitive {
                    if cell_val.contains(query) {
                        cell_val.replace(query, replacement)
                    } else {
                        cell_val.clone()
                    }
                } else if cell_val.to_lowercase().contains(&query_lower) {
                    let mut result = String::new();
                    let lower_val = cell_val.to_lowercase();
                    let mut last_idx = 0;

                    while let Some(match_pos) = lower_val[last_idx..].find(&query_lower) {
                        let abs_pos = last_idx + match_pos;
                        result.push_str(&cell_val[last_idx..abs_pos]);
                        result.push_str(replacement);
                        last_idx = abs_pos + query.len();
                    }
                    result.push_str(&cell_val[last_idx..]);
                    result
                } else {
                    cell_val.clone()
                };

                if new_val != cell_val {
                    self.update_cell(row_idx, col_idx, new_val.clone());
                    changes.push(ReplaceResult {
                        row: row_idx,
                        col: col_idx,
                        prev_value: cell_val,
                        new_value: new_val,
                    });
                }
            }
        }

        let count = changes.len();
        ReplaceAllResponse {
            replaced_count: count,
            changes,
        }
    }
}
