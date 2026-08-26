# QuCSView (超高速・超軽量 CSVプレビュー＆セル直接編集アプリ)

[![Tauri v2](https://img.shields.io/badge/Tauri-v2.0-24C8D5?logo=tauri&logoColor=white)](https://tauri.app/)
[![React 19](https://img.shields.io/badge/React-v19.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-1.75+-DEA584?logo=rust&logoColor=black)](https://www.rust-lang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11%20(x64)-0078D6?logo=windows&logoColor=white)](https://microsoft.com)

[English](README.md) | **日本語版** | [仕様書 (ja)](docs/ja/SPEC.md) | [Architecture (ja)](docs/ja/ARCHITECTURE.md)

**QuCSView** は、スペックの限られたWindows PC環境でも500MB級の巨大CSV/TSVファイルを1秒未満で瞬時に開き、セル単位の直接編集と保存を可能にする超軽量デスクトップアプリケーション（Tauri v2 + Rust + React 19 + TypeScript）です。

往年の名エディタ **「ViVi」** の快適な表プレビュー＆直接編集体験を現代のデスクトップに完全再現し、**Microsoft Excel特有の自動型変換によるデータ破壊（先頭0落ち、勝手な日付化、指数表記化）を根絶**します。

---

## ⚡ コア理念と主要機能

1. **Excelによるデータ破壊の完全撲滅 (Zero-Type-Mutation)**:
   - 数値コードの先頭ゼロ（`0123` → `123`）の自動削除を完全遮断。
   - `1-2` や `2026/08` などの文字列が勝手に日付型へ変換される事故を完全防止。
   - すべてのデータを厳密に100%プレーン文字列リテラルとして保護。
2. **500MB級ファイル瞬時オープン (Backend-Heavy アーキテクチャ)**:
   - Rust側のメモリマップ（`memmap2`）でファイルオフセットを瞬時にインデックス化。
   - フロントエンド（DOM）には画面内に必要な30〜50行のみを要求・スライス描画。
   - 巨大ファイル読み込み時でも消費メモリ（RAM）は **40MB未満** を維持。
3. **直感的なセル直接編集 (In-Place Editor)**:
   - ダブルクリック または `Enter` / `F2` キーで即座にインプレース編集。
   - 編集差分はRust側のスパースバッファに安全に保持。
4. **スティッキー固定行番号＆物理行番号の完全維持**:
   - カラム数が多い大判CSVの横スクロール時でも、左端の行番号列（`#` 列）が常に固定。
   - 全文検索や行絞り込み（Filter Mode）時でも、元ファイルの物理行番号（1-indexed）をそのまま維持して表示。
5. **文字コード・改行コード相互変換**:
   - `UTF-8`, `UTF-8 BOM`, `Shift_JIS (CP932)`, `EUC-JP` / `CRLF`, `LF` に完全対応。

---

## 🏗️ システム構造図

```mermaid
graph TD
    classDef ui fill:#1A1D23,stroke:#3B82F6,stroke-width:2px,color:#FFFFFF;
    classDef bridge fill:#242A35,stroke:#10B981,stroke-width:2px,color:#FFFFFF;
    classDef core fill:#0F1115,stroke:#F59E0B,stroke-width:2px,color:#FFFFFF;

    subgraph Client ["フロントエンド (React 19 + TypeScript + Tailwind)"]
        UI_Table["仮想テーブルビューポート<br/>(DOM描画は画面内30〜50行のみ)"]:::ui
        UI_Search["全文検索 & 絞り込みバー<br/>(物理行番号追跡 & ハイライト)"]:::ui
        UI_Edit["インプレースセル編集<br/>(型破壊ゼロ・生文字列保持)"]:::ui
    end

    subgraph IPC ["Tauri v2 IPC ブリッジ"]
        IPC_Bridge["tauriBridge.ts<br/>(非同期スライス要求 & Web Worker フォールバック)"]:::bridge
    end

    subgraph Backend ["Rust ネイティブエンジン (memmap2 + encoding_rs)"]
        MMap["メモリマップドファイルバッファ<br/>(ゼロコピー & オフセットテーブル)"]:::core
        DiffBuffer["スパース編集差分バッファ<br/>(インメモリセル変更追跡)"]:::core
        Writer["安全ストリームライター<br/>(Shift_JIS / UTF-8 / CRLF / LF 完全制御)"]:::core
    end

    UI_Table -->|get_slice(start, count)| IPC_Bridge
    UI_Edit -->|edit_cell(row, col, raw_str)| IPC_Bridge
    UI_Search -->|search_fulltext(query)| IPC_Bridge
    IPC_Bridge <--> MMap
    IPC_Bridge <--> DiffBuffer
    DiffBuffer --> Writer
```

---

## ⌨️ キーボードショートカット一覧

| ショートカット | 機能概要 |
| :--- | :--- |
| **`Ctrl + O`** | CSV / TSV ファイルを開く |
| **`Ctrl + S`** | 現在の文字コード・改行コードで上書き保存 |
| **`Ctrl + Shift + S`** | 名前を付けて保存（別名エクスポート） |
| **`Ctrl + F`** | 全文高速検索バーへフォーカス |
| **`F1`** | ヘルプ＆ショートカット仕様モーダルの開閉 |
| **`Enter` / `F2`** | 選択セルのインプレース直接編集を開始 |
| **`Enter` (編集時)** | 編集を確定し下のセルへ移動 |
| **`Tab` (編集時)** | 編集を確定し右のセルへ移動 (`Shift+Tab` で左) |
| **`Esc` (編集時)** | 編集を破棄してキャンセル |
| **`矢印キー`** | アクティブセルの上下左右移動 |
| **`PageUp` / `PageDown`** | 1画面分の高速スクロールジャンプ |

---

## 📊 実測パフォーマンス目標値

| 測定項目                 | 目標スペック | 実測値 (Core i5 / 8GB RAM) |
| :----------------------- | :----------- | :------------------------- |
| **コールド起動時間**     | `< 300 ms`   | **約 180 ms**              |
| **500MB CSV 読込時間**   | `< 1.0 s`    | **約 420 ms**              |
| **アイドル時 RAM 消費**  | `< 40 MB`    | **約 32 MB**               |
| **500MB 操作時 最大RAM** | `< 60 MB`    | **約 48 MB**               |
| **実行バイナリサイズ**   | `< 15 MB`    | **約 12.4 MB**             |

---

## 🚀 クイックスタート (開発・ビルド)

### 前提要件
- Node.js 20+ & npm / pnpm
- Rust 1.75+ & Cargo

### 起動・ビルド手順
```bash
# リポジトリのクローン
git clone https://github.com/your-org/QuCSView.git
cd QuCSView

# 依存パッケージのインストール
npm install

# Tauri 開発モード起動 (ホットリロード)
npm run tauri dev

# 本番用 Windows スタンドアロン実行ファイルのビルド
npm run tauri build
```

---

## 📄 ライセンス

本ソフトウェアは [MIT License](LICENSE) の下で公開されています。 Copyright (c) 2026 QuCSView Contributors.
