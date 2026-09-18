---
name: tauri-verification
description: >-
  Use this skill when verifying changes to source code in the QuCSView project (Rust backend and/or frontend),
  running cargo check/clippy/test and npm lint/test, or determining whether verification can be skipped for markdown/documentation-only edits.
---

# Tauri Verification & Quality Check Workflow

本スキルは、`QuCSView` におけるコード変更時の品質検証（Rustバックエンド、フロントエンド型チェック・テスト）およびドキュメント変更時の事前検証省略基準を定めた手順書です。

## 1. 検証省略の判断基準（迅速対応）

- **対象が Markdown のみ (`*.md` のみ)**:
  - Rust やフロントエンドの事前検証（`cargo` コマンドや `npm run lint` 等）は **すべて省略** し、迅速に応答・反映します。
- **対象にプログラムコード (`*.rs`, `*.ts`, `*.tsx`, `*.js`, `*.json` 等) が含まれる場合**:
  - 以下の検証手順を必ず実行します。

## 2. コード検証手順

コード変更後、以下の検証を順次実行してエラーや警告がないことを確認します。

```powershell
# 1. Rust 高速構文・型チェック
cargo check --manifest-path src-tauri/Cargo.toml

# 2. Rust 単体テスト実行
cargo test --manifest-path src-tauri/Cargo.toml

# 3. Rust Clippy 静的リント解析（警告ゼロを担保）
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings

# 4. Rust コードフォーマット検証
cargo fmt --manifest-path src-tauri/Cargo.toml --check

# 5. フロントエンド型チェック
npm run lint

# 6. フロントエンド単体テスト
npm run test
```

## 3. トラブルシューティング & 修正手順

- **Rustフォーマット違反 (`cargo fmt` 失敗時)**:
  - `cargo fmt --manifest-path src-tauri/Cargo.toml` を実行して自動整形を適用します。
- **リント・テストエラー時**:
  - エラー出力を確認し、該当コードを修正して再検証します。
