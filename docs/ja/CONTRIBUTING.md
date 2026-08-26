# 貢献ガイド (Contributing Guide)

[English](../../docs/en/CONTRIBUTING.md) | **日本語版**

---

## 1. はじめに

QuCSVPreview プロジェクトへのご協力をご検討いただき、ありがとうございます。本プロジェクトは「低スペックPCでの超高速性」と「データ型破壊の完全撲滅」を最優先事項として開発されています。

---

## 2. 開発・コントリビューションの流れ

1. **Issue の確認・作成**:
   - 大きな機能追加や仕様変更を行う場合は、事前に Issue を作成して設計方針を議論してください。
2. **リポジトリの Fork とブランチ作成**:
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. **コーディングルールの遵守**:
   - `docs/ja/INSTRUCTIONS.md` に記載された原則（React側への全量データ受け渡し禁止、文字列リテラルの型キャスト禁止）を遵守してください。
4. **コミット規約 (Conventional Commits)**:
   - `feat:`, `fix:`, `perf:`, `docs:`, `test:` などのプレフィックスを使用してください。
5. **Pull Request (PR) の作成**:
   - PRテンプレートに従い、変更概要、変更理由（Why）、テスト結果を記載してください。
