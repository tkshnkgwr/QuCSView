// UPDATE 2026-08-26: [RustDoc追加 & IPCハンドラ文書化]
// なぜ: Tauri v2 IPCコマンドのインターフェース契約、引数、戻り値をRustDocとして明文化し保守性を向上させるため。

//! # QuCSView Tauri v2 バックエンド エントリポイント
//!
//! フロントエンド（React）からの高頻度IPCリクエストを受け付け、
//! `CsvEngine` のスレッドセーフなミューテックスインスタンス経由で超高速にネイティブ処理を行います。

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod csv_engine;
use csv_engine::{
    CsvEngine, FileMetadata, SearchResponse, SliceResponse, SortConfig, SplitResult,
    SupportedEncoding, SupportedLineEnding,
};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

/// アプリケーション共有状態
struct AppState {
    /// ネイティブCSV処理エンジンインスタンス（排他制御）
    engine: Mutex<CsvEngine>,
}

/// 指定ファイルパスのCSV/TSVをメモリマップオープンしメタデータを返却
#[tauri::command]
fn open_csv_file(
    path: String,
    custom_delimiter: Option<char>,
    state: State<AppState>,
) -> Result<FileMetadata, String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine
        .open_file(&path, custom_delimiter)
        .map_err(|e| e.to_string())
}

/// 仮想スクロール表示用の行スライス（30〜50行）を取得
#[tauri::command]
fn get_slice(
    start_row: usize,
    row_count: usize,
    filter_indices: Option<Vec<usize>>,
    sort_config: Option<SortConfig>,
    state: State<AppState>,
) -> Result<SliceResponse, String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine
        .get_rows_slice(
            start_row,
            row_count,
            filter_indices.as_deref(),
            sort_config.as_ref(),
        )
        .map_err(|e| e.to_string())
}

/// 指定位置の単一セル値を取得
#[tauri::command]
fn get_cell_value(row: usize, col: usize, state: State<AppState>) -> Result<String, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    Ok(engine.get_cell_value(row, col))
}

/// 指定セルに新しい文字列値を直接適用（インプレース編集）
#[tauri::command]
fn edit_cell(
    row: usize,
    col: usize,
    value: String,
    state: State<AppState>,
) -> Result<bool, String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    Ok(engine.update_cell(row, col, value))
}

/// ヘッダー行有無設定を切り替え
#[tauri::command]
fn set_has_header(has_header: bool, state: State<AppState>) -> Result<FileMetadata, String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.set_has_header(has_header).map_err(|e| e.to_string())
}

/// 指定位置に行を挿入
#[tauri::command]
fn insert_row(
    row: usize,
    row_data: Option<Vec<String>>,
    state: State<AppState>,
) -> Result<FileMetadata, String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.insert_row(row, row_data).map_err(|e| e.to_string())
}

/// 指定行を削除
#[tauri::command]
fn delete_row(row: usize, state: State<AppState>) -> Result<(Vec<String>, usize), String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.delete_row(row).map_err(|e| e.to_string())
}

/// 指定行を複製
#[tauri::command]
fn duplicate_row(
    source_row: usize,
    target_row: Option<usize>,
    state: State<AppState>,
) -> Result<(usize, Vec<String>, usize), String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine
        .duplicate_row(source_row, target_row)
        .map_err(|e| e.to_string())
}

/// 指定位置に列を挿入
#[tauri::command]
fn insert_col(
    col: usize,
    header_name: Option<String>,
    state: State<AppState>,
) -> Result<FileMetadata, String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine
        .insert_col(col, header_name)
        .map_err(|e| e.to_string())
}

/// 指定列を削除
#[tauri::command]
fn delete_col(
    col: usize,
    state: State<AppState>,
) -> Result<(String, Vec<String>, usize, Vec<String>), String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.delete_col(col).map_err(|e| e.to_string())
}

/// 指定列を複製
#[tauri::command]
#[allow(clippy::type_complexity)]
fn duplicate_col(
    source_col: usize,
    target_col: Option<usize>,
    header_name: Option<String>,
    state: State<AppState>,
) -> Result<(usize, String, Vec<String>, usize, Vec<String>), String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine
        .duplicate_col(source_col, target_col, header_name)
        .map_err(|e| e.to_string())
}

/// 正規表現および全文高速検索を実行
#[tauri::command]
fn search_csv(
    query: String,
    case_sensitive: bool,
    use_regex: bool,
    column_filter: Option<usize>,
    state: State<AppState>,
) -> Result<SearchResponse, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    Ok(engine.search(&query, case_sensitive, use_regex, column_filter))
}

/// 大容量CSVファイルを指定行数ごとに分割して保存
#[tauri::command]
fn split_csv(
    chunk_size: usize,
    output_dir: String,
    prefix: String,
    include_header: bool,
    state: State<AppState>,
) -> Result<SplitResult, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    let out_path = PathBuf::from(output_dir);
    engine
        .split_csv(chunk_size, &out_path, &prefix, include_header)
        .map_err(|e| e.to_string())
}

/// 現在のテーブル全体または一部を生テキスト（CSV文字列）として取得
#[tauri::command]
fn get_raw_text(max_lines: Option<usize>, state: State<AppState>) -> Result<String, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    Ok(engine.get_raw_text(max_lines))
}

/// 指定エンコーディング・改行コード・区切り文字でファイルへ保存
#[tauri::command]
fn save_csv(
    path: String,
    encoding: SupportedEncoding,
    line_ending: SupportedLineEnding,
    delimiter: Option<char>,
    state: State<AppState>,
) -> Result<bool, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    let delim_byte = delimiter.map(|c| c as u8);
    engine
        .save_to_file(&path, encoding, line_ending, delim_byte)
        .map_err(|e| e.to_string())?;
    Ok(true)
}

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            engine: Mutex::new(CsvEngine::new()),
        })
        .invoke_handler(tauri::generate_handler![
            open_csv_file,
            get_slice,
            get_cell_value,
            edit_cell,
            set_has_header,
            insert_row,
            delete_row,
            duplicate_row,
            insert_col,
            delete_col,
            duplicate_col,
            search_csv,
            split_csv,
            get_raw_text,
            save_csv,
        ])
        .run(tauri::generate_context!())
        .expect("error while running QuCSVPreview tauri application");
}
