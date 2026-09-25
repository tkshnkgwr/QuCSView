// UPDATE 2026-08-26: [CsvEngine 単体テストスイート]
// なぜ: ゼロ型破壊、スライス抽出、編集、行/列操作、検索、TSV出力等の完全性を自動検証するため。

//! # CsvEngine 単体テストスイート

use super::*;
use std::io::Write;
use tempfile::NamedTempFile;

fn create_test_csv(content: &str) -> NamedTempFile {
    let mut file = NamedTempFile::new().unwrap();
    file.write_all(content.as_bytes()).unwrap();
    file.flush().unwrap();
    file
}

#[test]
fn test_open_csv_and_preserve_leading_zero() {
    let csv_data = "ID,Code,Name\r\n1,0123,Alice\r\n2,009876,Bob\r\n";
    let temp_file = create_test_csv(csv_data);

    let mut engine = CsvEngine::new();
    let meta = engine.open_file(temp_file.path(), None).unwrap();

    assert_eq!(meta.total_rows, 2);
    assert_eq!(meta.total_cols, 3);
    assert_eq!(meta.headers, vec!["ID", "Code", "Name"]);
    assert_eq!(engine.get_cell_value(0, 1), "0123");
    assert_eq!(engine.get_cell_value(1, 1), "009876");
}

#[test]
fn test_cell_editing_and_rollback() {
    let csv_data = "ID,Name\r\n1,Alice\r\n2,Bob\r\n";
    let temp_file = create_test_csv(csv_data);

    let mut engine = CsvEngine::new();
    engine.open_file(temp_file.path(), None).unwrap();

    assert_eq!(engine.get_cell_value(0, 1), "Alice");
    assert!(!engine.get_metadata().is_dirty);

    // 編集
    let ok = engine.update_cell(0, 1, "Charlie".to_string());
    assert!(ok);
    assert_eq!(engine.get_cell_value(0, 1), "Charlie");
    assert!(engine.get_metadata().is_dirty);
}

#[test]
fn test_insert_and_delete_row() {
    let csv_data = "ID,Name\r\n1,Alice\r\n2,Bob\r\n";
    let temp_file = create_test_csv(csv_data);

    let mut engine = CsvEngine::new();
    engine.open_file(temp_file.path(), None).unwrap();

    // 行挿入
    let new_row = vec!["3".to_string(), "Charlie".to_string()];
    let meta = engine.insert_row(1, Some(new_row)).unwrap();
    assert_eq!(meta.total_rows, 3);
    assert_eq!(engine.get_cell_value(1, 1), "Charlie");
    assert_eq!(engine.get_cell_value(2, 1), "Bob");

    // 行削除
    let (deleted, total) = engine.delete_row(1).unwrap();
    assert_eq!(deleted, vec!["3", "Charlie"]);
    assert_eq!(total, 2);
    assert_eq!(engine.get_cell_value(1, 1), "Bob");
}

#[test]
fn test_insert_and_delete_col() {
    let csv_data = "ID,Name\r\n1,Alice\r\n2,Bob\r\n";
    let temp_file = create_test_csv(csv_data);

    let mut engine = CsvEngine::new();
    engine.open_file(temp_file.path(), None).unwrap();

    // 列挿入
    let meta = engine.insert_col(1, Some("Age".to_string())).unwrap();
    assert_eq!(meta.total_cols, 3);
    assert_eq!(meta.headers, vec!["ID", "Age", "Name"]);
    assert_eq!(engine.get_cell_value(0, 1), "");
    assert_eq!(engine.get_cell_value(0, 2), "Alice");

    // 列削除
    let (header, _values, total_cols, headers) = engine.delete_col(1).unwrap();
    assert_eq!(header, "Age");
    assert_eq!(total_cols, 2);
    assert_eq!(headers, vec!["ID", "Name"]);
    assert_eq!(engine.get_cell_value(0, 1), "Alice");
}

#[test]
fn test_regex_search() {
    let csv_data = "ID,Zip\r\n1,060-0001\r\n2,100-0001\r\n3,INVALID_ZIP\r\n";
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

#[test]
fn test_get_range_tsv() {
    let csv_data = "A,B,C\r\n1,2,3\r\n4,5,6\r\n7,8,9\r\n";
    let temp_file = create_test_csv(csv_data);

    let mut engine = CsvEngine::new();
    engine.open_file(temp_file.path(), None).unwrap();

    // 2x2 矩形選択
    let (tsv, rows, cols) = engine.get_range_tsv(0, 1, 1, 2, None, None).unwrap();
    assert_eq!(rows, 2);
    assert_eq!(cols, 2);
    assert_eq!(tsv, "2\t3\n5\t6");

    // 単一セル選択 (1x1)
    let (single_tsv, s_rows, s_cols) = engine.get_range_tsv(0, 0, 0, 0, None, None).unwrap();
    assert_eq!(s_rows, 1);
    assert_eq!(s_cols, 1);
    assert_eq!(single_tsv, "1");

    // 横方向複数セル (1x3) -> タブ区切り
    let (horiz_tsv, h_rows, h_cols) = engine.get_range_tsv(0, 0, 0, 2, None, None).unwrap();
    assert_eq!(h_rows, 1);
    assert_eq!(h_cols, 3);
    assert_eq!(horiz_tsv, "1\t2\t3");

    // 縦方向複数セル (3x1) -> 改行区切り
    let (vert_tsv, v_rows, v_cols) = engine.get_range_tsv(0, 2, 0, 0, None, None).unwrap();
    assert_eq!(v_rows, 3);
    assert_eq!(v_cols, 1);
    assert_eq!(vert_tsv, "1\n4\n7");
}

#[test]
fn test_get_col_data() {
    let csv_data = "A,B\r\n10,20\r\n30,40\r\n";
    let temp_file = create_test_csv(csv_data);

    let mut engine = CsvEngine::new();
    engine.open_file(temp_file.path(), None).unwrap();

    let col1 = engine.get_col_data(1);
    assert_eq!(col1, vec!["20", "40"]);
}

#[test]
fn test_update_from_text() {
    let mut engine = CsvEngine::new();
    let raw_text = "H1,H2\r\nX,Y\r\nZ,W\r\n";
    let meta = engine.update_from_text(raw_text, None).unwrap();

    assert_eq!(meta.total_rows, 2);
    assert_eq!(meta.total_cols, 2);
    assert_eq!(meta.headers, vec!["H1", "H2"]);
    assert_eq!(engine.get_cell_value(0, 0), "X");
    assert_eq!(engine.get_cell_value(1, 1), "W");
}

#[test]
fn test_clear_modified_cells() {
    let csv_data = "ID,Name\r\n1,Alpha\r\n";
    let temp_file = create_test_csv(csv_data);

    let mut engine = CsvEngine::new();
    engine.open_file(temp_file.path(), None).unwrap();

    engine.update_cell(0, 1, "Beta".to_string());
    assert_eq!(engine.modified_cells.len(), 1);

    engine.clear_modified_cells();
    assert_eq!(engine.modified_cells.len(), 0);
}

#[test]
fn test_regex_replace_with_capture_group() {
    let csv_data = "ID,Phone\r\n1,09012345678\r\n2,08098765432\r\n";
    let temp_file = create_test_csv(csv_data);

    let mut engine = CsvEngine::new();
    engine.open_file(temp_file.path(), None).unwrap();

    // 090-1234-5678 形式への正規表現キャプチャ置換
    let res = engine.replace_all(r"(\d{3})(\d{4})(\d{4})", "$1-$2-$3", true, true, Some(1));

    assert_eq!(res.replaced_count, 2);
    assert_eq!(engine.get_cell_value(0, 1), "090-1234-5678");
    assert_eq!(engine.get_cell_value(1, 1), "080-9876-5432");
}

#[test]
fn test_replace_cell_case_insensitive() {
    let csv_data = "ID,Role\r\n1,Developer\r\n2,Manager\r\n";
    let temp_file = create_test_csv(csv_data);

    let mut engine = CsvEngine::new();
    engine.open_file(temp_file.path(), None).unwrap();

    let res = engine
        .replace_cell(0, 1, "developer", "Lead Engineer", false, false)
        .unwrap();

    assert_eq!(res.prev_value, "Developer");
    assert_eq!(res.new_value, "Lead Engineer");
    assert_eq!(engine.get_cell_value(0, 1), "Lead Engineer");
}

#[test]
fn test_set_has_header_with_in_memory_rows() {
    let csv_data = "Name,Age\r\nAlice,30\r\nBob,25\r\n";
    let mut engine = CsvEngine::new();
    let meta = engine.update_from_text(csv_data, None).unwrap();
    assert_eq!(meta.total_rows, 2);
    assert_eq!(meta.headers, vec!["Name", "Age"]);

    // ヘッダーなしに切替
    let meta_no_hdr = engine.set_has_header(false).unwrap();
    assert_eq!(meta_no_hdr.total_rows, 3);
    assert_eq!(meta_no_hdr.headers, vec!["1", "2"]);
    assert_eq!(engine.get_cell_value(0, 0), "Name");
    assert_eq!(engine.get_cell_value(1, 0), "Alice");

    // 再度ヘッダーありに切替
    let meta_hdr = engine.set_has_header(true).unwrap();
    assert_eq!(meta_hdr.total_rows, 2);
    assert_eq!(meta_hdr.headers, vec!["Name", "Age"]);
    assert_eq!(engine.get_cell_value(0, 0), "Alice");
}

#[test]
fn test_set_has_header_with_mmap() {
    let csv_data = "Name,Age\r\nAlice,30\r\nBob,25\r\n";
    let temp_file = create_test_csv(csv_data);
    let mut engine = CsvEngine::new();
    let meta = engine.open_file(temp_file.path(), None).unwrap();
    assert_eq!(meta.total_rows, 2);

    // ヘッダーなしに切替
    let meta_no_hdr = engine.set_has_header(false).unwrap();
    assert_eq!(meta_no_hdr.total_rows, 3);
    assert_eq!(meta_no_hdr.headers, vec!["1", "2"]);
    assert_eq!(engine.get_cell_value(0, 0), "Name");

    // 再度ヘッダーありに切替
    let meta_hdr = engine.set_has_header(true).unwrap();
    assert_eq!(meta_hdr.total_rows, 2);
    assert_eq!(meta_hdr.headers, vec!["Name", "Age"]);
    assert_eq!(engine.get_cell_value(0, 0), "Alice");
}

#[test]
fn test_header_toggle_with_empty_cells_preserves_empty_value() {
    let csv_data = "30,,1,20260727\r\n40,,1,20260727\r\n";
    let temp_file = create_test_csv(csv_data);
    let mut engine = CsvEngine::new();
    let meta = engine.open_file(temp_file.path(), None).unwrap();
    // 表示用ヘッダーは空セルが "Col 2" に置換される
    assert_eq!(meta.headers, vec!["30", "Col 2", "1", "20260727"]);

    // ヘッダーなしに切替
    let meta_no_hdr = engine.set_has_header(false).unwrap();
    assert_eq!(meta_no_hdr.total_rows, 2);
    // プレビューの 0行目 1列目は元の空文字列のまま（"Col 2" が入っていないこと）
    assert_eq!(engine.get_cell_value(0, 0), "30");
    assert_eq!(engine.get_cell_value(0, 1), "");

    // get_raw_text にも "Col 2" が含まれないこと
    let raw_text = engine.get_raw_text(None);
    assert!(!raw_text.contains("Col 2"));
    assert!(raw_text.starts_with("30,,1,20260727"));

    // update_from_text (WebWorker からの同期) の場合もテスト
    let mut mem_engine = CsvEngine::new();
    mem_engine.update_from_text(csv_data, None).unwrap();
    let mem_no_hdr = mem_engine.set_has_header(false).unwrap();
    assert_eq!(mem_no_hdr.total_rows, 2);
    assert_eq!(mem_engine.get_cell_value(0, 1), "");
    let mem_raw_text = mem_engine.get_raw_text(None);
    assert!(!mem_raw_text.contains("Col 2"));
    assert!(mem_raw_text.starts_with("30,,1,20260727"));
}

#[test]
fn test_get_raw_text_does_not_insert_empty_line_after_header() {
    // CRLF ファイル
    let csv_crlf = "ColA,ColB\r\nValA1,ValB1\r\nValA2,ValB2\r\n";
    let temp_crlf = create_test_csv(csv_crlf);
    let mut engine_crlf = CsvEngine::new();
    engine_crlf.open_file(temp_crlf.path(), None).unwrap();

    let raw_crlf = engine_crlf.get_raw_text(None);
    let lines_crlf: Vec<&str> = raw_crlf.split("\r\n").collect();
    assert_eq!(lines_crlf[0], "ColA,ColB");
    assert_eq!(
        lines_crlf[1], "ValA1,ValB1",
        "Header must be directly followed by Row 1, not empty line"
    );
    assert_eq!(lines_crlf[2], "ValA2,ValB2");

    // LF ファイル
    let csv_lf = "ColA,ColB\nValA1,ValB1\nValA2,ValB2\n";
    let temp_lf = create_test_csv(csv_lf);
    let mut engine_lf = CsvEngine::new();
    engine_lf.open_file(temp_lf.path(), None).unwrap();

    let raw_lf = engine_lf.get_raw_text(None);
    let lines_lf: Vec<&str> = raw_lf.split('\n').collect();
    assert_eq!(lines_lf[0], "ColA,ColB");
    assert_eq!(
        lines_lf[1], "ValA1,ValB1",
        "Header must be directly followed by Row 1, not empty line"
    );
    assert_eq!(lines_lf[2], "ValA2,ValB2");
}

#[test]
fn test_header_toggle_preserves_first_row_data() {
    let csv_data = "HeaderCol1,HeaderCol2\nDataRow1Col1,DataRow1Col2\nDataRow2Col1,DataRow2Col2\n";
    let temp_file = create_test_csv(csv_data);
    let mut engine = CsvEngine::new();
    let meta = engine.open_file(temp_file.path(), None).unwrap();

    // 初期状態 (ヘッダあり)
    assert_eq!(meta.total_rows, 2);
    assert_eq!(meta.headers, vec!["HeaderCol1", "HeaderCol2"]);
    assert_eq!(engine.get_cell_value(0, 0), "DataRow1Col1");

    // ヘッダなしに切り替え
    let meta_no_hdr = engine.set_has_header(false).unwrap();
    assert_eq!(meta_no_hdr.total_rows, 3);
    assert_eq!(meta_no_hdr.headers, vec!["1", "2"]);
    // 元のヘッダが第0行のデータとして復元されていること
    assert_eq!(engine.get_cell_value(0, 0), "HeaderCol1");
    assert_eq!(engine.get_cell_value(0, 1), "HeaderCol2");
    assert_eq!(engine.get_cell_value(1, 0), "DataRow1Col1");

    // 再度ヘッダありに切り替え
    let meta_hdr = engine.set_has_header(true).unwrap();
    assert_eq!(meta_hdr.total_rows, 2);
    assert_eq!(meta_hdr.headers, vec!["HeaderCol1", "HeaderCol2"]);
    assert_eq!(engine.get_cell_value(0, 0), "DataRow1Col1");
}

#[test]
fn test_save_to_same_file_while_mmap_open() {
    let csv_data = "ID,Name\r\n1,Alice\r\n2,Bob\r\n";
    let temp_file = create_test_csv(csv_data);
    let path = temp_file.path().to_path_buf();
    let mut engine = CsvEngine::new();
    engine.open_file(&path, None).unwrap();
    engine.update_cell(0, 1, "Charlie".to_string());
    assert!(engine.get_metadata().is_dirty);

    let res = engine.save_to_file(
        &path,
        SupportedEncoding::Utf8,
        SupportedLineEnding::CRLF,
        None,
    );
    assert!(res.is_ok());

    // 保存後、エンジン内部のセル値が更新され、is_dirty が false にリセットされていること
    assert_eq!(engine.get_cell_value(0, 1), "Charlie");
    assert!(!engine.get_metadata().is_dirty);

    // 実際のファイル内容も書き換わっていること
    let disk_content = std::fs::read_to_string(&path).unwrap();
    assert_eq!(disk_content, "ID,Name\r\n1,Charlie\r\n2,Bob\r\n");
}
