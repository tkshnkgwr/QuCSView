# システム設計書 (Architecture Design)

[English](../../docs/en/ARCHITECTURE.md) | **日本語版**

---

## 1. Backend-Heavy 設計思想

Webフロントエンド（DOM）に数十万行〜数百万行のデータをそのまま流し込むと、DOMノードの過多とV8ガベージコレクション（GC）の停止により、ブラウザは即座にフリーズします。

QuCSViewでは、**「データ処理・インデックス化・メモリ管理はすべてRustバックエンド側で完結させ、フロントエンドには画面枠内（30〜50行）の描画用スライスのみを渡す」** という **Backend-Heavy** アーキテクチャを徹底しています。

---

## 2. コア通信シーケンス (Tauri v2 IPC)

```mermaid
sequenceDiagram
    autonumber
    actor User as ユーザー / UI
    participant React as React 19 Frontend
    participant IPC as Tauri v2 IPC Bridge
    participant Rust as Rust Native Engine
    participant MMap as memmap2 (OS Page Cache)

    User->>React: CSVファイルをドラッグ＆ドロップ (500MB)
    React->>IPC: invoke("open_file", { path })
    IPC->>Rust: open_file() 呼び出し
    Rust->>MMap: File::open() -> MmapOptions::map()
    MMap-->>Rust: mmap ポインタ (0ms コピーゼロ)
    Rust->>Rust: 改行オフセットテーブル生成 (Byte Scan)
    Rust-->>IPC: FileMetadata (行数, 列数, ヘッダー一覧)
    IPC-->>React: メタデータ返却 (所要時間 ~400ms)
    
    rect rgb(30, 40, 60)
        Note over React, Rust: 仮想スクロール描画ループ
        React->>IPC: invoke("get_slice", { startRow: 1000, rowCount: 40 })
        IPC->>Rust: get_rows_slice(1000, 40)
        Rust->>MMap: オフセット位置から直接40行のみパース
        Rust->>Rust: 差分バッファ(HashMap)のマージ
        Rust-->>IPC: SliceResponse (40行分のテキスト配列)
        IPC-->>React: setVisibleRows(rows) -> 仮想DOM描画 (所要時間 ~1ms)
    end

    User->>React: セル編集 (R:1002, C:3, "009988")
    React->>IPC: invoke("edit_cell", { row: 1002, col: 3, value: "009988" })
    Rust->>Rust: diff_buffer.insert((1002, 3), "009988")
    Rust-->>IPC: Success (isDirty: true)
```

---

## 3. Rustメモリマップとインデックス構造 (`src-tauri/src/csv_engine.rs`)

### 3.1 `memmap2` によるゼロコピー
- OSのページキャッシュを直接利用するため、500MBのファイルであってもアプリプロセスの物理メモリを消費しません。
- 起動時に単一パスの高速バイト走査（`\n` / `\r\n` の検出）を行い、各行の先頭バイトオフセット（`Vec<usize>`）を構築します。
- 1,000万行のCSVであっても、インデックスに必要なメモリは `10,000,000 × 8 bytes ≈ 80MB` のみです。

### 3.2 スパース差分バッファ (`DiffBuffer`)
- ユーザーによるセルの変更は、元のファイルバッファを直接破壊せず、`HashMap<(usize, usize), String>` にスパース（疎）に記録されます。
- 保存（`save_file`）要求時、メモリマップドバッファから元データをストリーミング読み出ししつつ、差分バッファの値を置換して指定エンコーディング（`Shift_JIS` / `UTF-8`）で一括出力します。

---

## 4. メモリ安全性とスレッドモデル

1. **Rustのスレッド安全性**:
   - `CsvEngine` は `Arc<Mutex<CsvEngine>>` または `RwLock` で保護され、Tauriの非同期ワーカースレッドプールから安全にアクセスされます。
2. **文字列リテラル保護**:
   - パース処理では数値変換ルーチン（`f64::parse` 等）を一切経由せず、スライスから直接UTF-8文字列として抽出するため、型の誤判定や桁落ちが構造上発生しません。
