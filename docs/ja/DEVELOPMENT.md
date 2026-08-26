# 開発・ビルド手順書 (Development & Build Guide)

[English](../../docs/en/DEVELOPMENT.md) | **日本語版**

---

## 1. 開発環境のセットアップ

### 必要ツール
- **Node.js**: v20.x 以上 (LTS推奨)
- **Rust**: v1.75.0 以上 (stable)
- **C++ Build Tools**: Visual Studio 2022 C++ Build Tools (Windows環境)
- **パッケージマネージャー**: npm または pnpm

---

## 2. 開発コマンド一覧

### 依存関係のインストール
```bash
npm install
```

### Tauri デスクトップアプリのローカル起動 (ホットリロード)
```bash
npm run tauri dev
```

### Webプロトタイプのブラウザ単体起動 (Web Worker フォールバック)
```bash
npm run dev
```

### ユニットテストの実行
```bash
# Rust バックエンドテスト
cargo test --manifest-path src-tauri/Cargo.toml

# フロントエンド Vitest テスト
npm run test
```

### 型チェック & リンターの実行
```bash
# TypeScript 型検証
npm run lint

# Rust コード整形 & Clippy 静的解析
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

### APIドキュメントの生成
```bash
# TypeDoc (TypeScript API) の生成 -> docs/api/
npm run doc

# Rustdoc (Rust Backend API) の生成 -> src-tauri/target/doc/
cargo doc --manifest-path src-tauri/Cargo.toml --no-deps
```

---

## 3. プロダクションビルド

### Windows用実行ファイル・インストーラーの生成
```bash
npm run tauri build
```
ビルド成果物は `src-tauri/target/release/bundle/` 配下に `.msi`, `.exe`, ポータブルバイナリとして生成されます。

---

## 4. デバッグ手法

- **フロントエンドデバッグ**: `npm run tauri dev` 実行中に `F12` または右クリック「検証」でWebkit/Chromium DevToolsを起動。
- **Rustバックエンドデバッグ**: `RUST_LOG=debug npm run tauri dev` で詳細なターミナルログを出力。
