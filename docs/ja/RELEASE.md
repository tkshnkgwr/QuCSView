# リリース手順書 (Release Guide)

[English](../../docs/en/RELEASE.md) | **日本語版**

---

## 1. バージョニング規約

QuCSVPreviewは **セマンティック バージョニング (Semantic Versioning 2.0.0)** に準拠します。

- **MAJOR (X.0.0)**: 互換性のない破壊的変更やアーキテクチャの大幅刷新
- **MINOR (0.X.0)**: 後方互換性のある新機能の追加（新規ファイル形式対応、ソート拡張等）
- **PATCH (0.0.X)**: 後方互換性のあるバグ修正や軽微なパフォーマンス改善

---

## 2. リリース手順フロー

### 1. バージョン番号の更新
- `package.json` の `"version"` を更新
- `src-tauri/tauri.conf.json` の `"version"` を更新
- `src-tauri/Cargo.toml` の `version` を更新

### 2. CHANGELOG.md の更新
- `[Unreleased]` セクションの内容を新しいバージョン番号およびリリース日に更新

### 3. Git タグの作成とプッシュ
```bash
git commit -am "chore(release): v0.1.0"
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin main --tags
```

### 4. GitHub Actions 自動ビルド & リリース
- タグのプッシュにより GitHub Actions ワークフロー（`.github/workflows/release.yml`）が自動起動。
- Windows x64 向けの `.msi`, `.exe`, ポータブル版 `.zip` がビルドされ、GitHub Releasesに自動ドラフト作成されます。
