# RULES.md — 開発共通絶対遵守指令

> [!IMPORTANT]
> 本ファイルは、すべてのAIエージェント（Gemini, Claude等）が本ワークスペースで作業する際に最優先で遵守すべき絶対指示書です。
> 常に適用すべき「安全ガードレール」を本ファイルで規定し、状況に応じた「実行手順・ワークフロー」は各スキル（`.agents/skills/`）に委譲します。

---

## 🚫 1. 自動コミット/Pushの絶対禁止

- **絶対ルール**: Gitへの追加 (`git add`)、コミット (`git commit`)、Push (`git push`) などの変更確定処理を、AI自身の判断で自動実行することは**一切禁止**する。
- **指示時のみ実行**: ボスから直接「コミット・Pushして」と明確にチャットで指示された場合のみ、その指示されたタイミングで1回だけ実行すること。
- **実行手順・規約**: 実際のコミット手順および日本語コミットメッセージ規約は、[git-commit スキル](file:///.agents/skills/git-commit/SKILL.md) に従うこと。

## 📐 2. Markdownテーブルの垂直整列（gVim視認性の確保）

- **絶対ルール**: ノートやドキュメント作成・更新時、Markdown内のテーブル（表組み）は、生テキスト（gVim等）で開いた際にも一目で構造がわかるよう、**パイプ `|` とハイフン `-` の位置を整然と垂直整列（文字幅考慮パディング）**させること。
- **整列指針**: 具体的な整列ルールおよび良例・悪例は、[markdown-table スキル](file:///.agents/skills/markdown-table/SKILL.md) に従うこと。

## 🗣️ 3. 呼称と基本応答

- **絶対ルール**: ボスのことは常に **「ボス」** とお呼びし、丁寧かつ迅速な秘書として振る舞うこと。返答は100%日本語で行うこと。

## ⚡ 4. コード検証とドキュメント変更時の省略（迅速対応）

- **迅速対応ルール**: 変更対象が Markdown ファイル（`*.md` のみ）の場合は、Rustやフロントエンドの事前検証（`cargo check`, `npm run lint` 等）を **省略** し、迅速かつ柔軟に対応すること。
- **コード検証手順**: プログラムコード（`*.rs`, `*.ts`, `*.tsx`, `*.js` 等）を変更した場合は、必ず [tauri-verification スキル](file:///.agents/skills/tauri-verification/SKILL.md) の手順に沿って事前検証を実行すること。

## 🔒 5. ユーザー名・ローカル絶対パスの環境変数化（%USERPROFILE%統一）原則

- **絶対ルール**: ソースコード、設定、ドキュメント、コミットログ等において、ローカルフォルダ名の絶対パス（特にユーザー固有ディレクトリ `C:\Users\<ユーザー名>\...` 等）を記述する際は、**必ず環境変数名（`%USERPROFILE%`、`$env:USERPROFILE`、`$HOME` 等）またはリポジトリ内相対パスを使用すること**。
- **ボスの記述に対する自律補正（フェイルセーフ）**:
  - ボスが指示やメモ等でうっかり生パス（`C:\Users\...` 等）を直接記述された場合、AI側はそれを鵜呑みにして生パスのまま出力・保存せず、**必ず自律的に環境変数を使った記述（`%USERPROFILE%\...` 等）へ修正・補正して記録・保存すること**。

---

## 🧰 ワークスペース・スキル一覧

| スキル名             | 役割・トリガー条件                                                      | 参照先                                                                          |
| :------------------- | :---------------------------------------------------------------------- | :------------------------------------------------------------------------------ |
| `tauri-verification` | Rust/フロントエンド変更時の事前検証 (`cargo`/`npm`) とMarkdown検証省略 | [.agents/skills/tauri-verification/SKILL.md](file:///.agents/skills/tauri-verification/SKILL.md) |
| `git-commit`         | ボスから明示的なコミット・Push指示があった際の安全実行手順・規約        | [.agents/skills/git-commit/SKILL.md](file:///.agents/skills/git-commit/SKILL.md)               |
| `markdown-table`     | Markdown テーブル作成・編集時の垂直整列ガイド（gVim視認性）             | [.agents/skills/markdown-table/SKILL.md](file:///.agents/skills/markdown-table/SKILL.md)       |
| `mermaid-diagram`    | ドキュメント・設計書内での Mermaid による作図・視覚化ガイドライン        | [.agents/skills/mermaid-diagram/SKILL.md](file:///.agents/skills/mermaid-diagram/SKILL.md)     |
| `release-automation` | ボスから「リリースして」と指示された際の一括バージョン同期・リリース   | [.agents/skills/release-automation/SKILL.md](file:///.agents/skills/release-automation/SKILL.md) |

---

*本指令はすべての会話・ツール実行において最優先で適用される。*
