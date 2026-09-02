# リリース・パッケージングガイド (RELEASE)

[English](../../docs/en/RELEASE.md) | **日本語版**

---

## 1. バージョン管理規約

本プロジェクトは **セマンティック バージョニング (Semantic Versioning 2.0.0)** に準拠します。
`MAJOR.MINOR.PATCH` (例: `0.1.1`)

- **MAJOR**: 互換性のないUI/データ構造の変更
- **MINOR**: 後方互換性のある新機能追加
- **PATCH**: 後方互換性のあるバグ修正・軽微な改善

---

## 2. リリース準備チェックリスト (Single Source Versioning)

バージョン更新時は、以下の Single Source of Truth に基づき更新を行います。

| 項目                         | ファイル / 場所                           |
| :--------------------------- | :---------------------------------------- |
| フロントエンド標準バージョン | [`package.json`](../../package.json)      |
| Rust クレートバージョン      | [`src-tauri/Cargo.toml`](../../src-tauri/Cargo.toml) |
| Tauri アプリケーション定義    | [`src-tauri/tauri.conf.json`](../../src-tauri/tauri.conf.json) |
| 日本語更新履歴               | [`docs/ja/CHANGELOG.md`](CHANGELOG.md)    |
| 英語更新履歴                 | [`docs/en/CHANGELOG.md`](../en/CHANGELOG.md) |

---

## 3. CI / CD 自動化ワークフロー (GitHub Actions)

### 3.1 CI ワークフロー (`.github/workflows/ci.yml`)

- **トリガー**: `main` ブランチへの `push`（Markdown変更除外）および `pull_request`
- **処理内容**:
  - TypeScript 型チェック (`npm run lint`)
  - Vitest 単体テスト (`npm run test`)
  - Rust コード整形・Clippy静的解析 (`cargo fmt`, `cargo clippy`)
  - Rust ユニットテスト (`cargo test`)
  - Tauri バックエンドコンパイル検証 (`cargo check`)

### 3.2 リリース自動化ワークフロー (`.github/workflows/release.yml`)

- **トリガー**: `v*` タグのプッシュ（例: `git push origin v0.1.1`）または GitHub Actions 手動トリガー (`workflow_dispatch`)
- **処理内容**:
  - 品質事前チェックの自動実行
  - Windows デスクトップアプリバイナリ (`.msi` / `.exe` インストーラー) の全自動ビルド
  - GitHub Releases ページの自動生成とインストーラーバイナリアタッチ

---

## 4. リリース実行手順 (ボス用手順)

### ワンコマンドでのバージョン同期
```bash
# patch バージョンアップ (例: 0.1.0 -> 0.1.1)
npm run release

# minor バージョンアップ (例: 0.1.0 -> 0.2.0)
npm run release minor

# major バージョンアップ (例: 0.1.0 -> 1.0.0)
npm run release major
```

### Git コミット・タグ作成とプッシュ (GitHub Releases 発動)
```bash
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "release: bump version to v0.1.1"
git tag v0.1.1
git push origin main
git push origin v0.1.1
```
