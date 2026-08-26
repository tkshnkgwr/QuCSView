// UPDATE 2026-08-26: [CsvEngine 検索エンジンモジュール]
// なぜ: 全文検索、PCRE互換正規表現検索、カラムフィルタリング処理の単一責任管理のため。

//! # CsvEngine 検索エンジンモジュール

use super::types::{SearchResponse, SearchResult};
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
}
