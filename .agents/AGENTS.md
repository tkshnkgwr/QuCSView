# AI Agent Development Guidelines for QuCSView (AGENTS.md)

本プロジェクト（QuCSView: 大容量CSV/TSVプレビュー＆インプレースエディタ）におけるAIエージェントの開発指示書です。
最優先ルール（自動コミット禁止・Markdownテーブル垂直整列・呼称「ボス」等）は [RULES.md](../RULES.md) および [GEMINI.md](../GEMINI.md) を参照してください。

---

## 🏛️ プロジェクト概要と技術スタック

QuCSView は、リソース制限のあるWindows環境でも500MB超のCSV/TSVファイルを瞬時にプレビュー・編集できる超高速軽量デスクトップアプリです。

| レイヤー           | 技術スタック                                       | 役割・責務                                                           |
| :----------------- | :------------------------------------------------- | :------------------------------------------------------------------- |
| フロントエンド     | React 19, TypeScript, Tailwind CSS, Vite           | 仮想テーブル描画（DOM常駐30〜50行）、インプレース編集、検索UI        |
| IPCブリッジ        | Tauri v2 IPC (`src/services/tauriBridge.ts`)       | 非同期スライス取得、編集差分通信、ファイル保存・分割要求             |
| バックエンド(Rust) | Tauri v2, `memmap2`, `encoding_rs`, `csv`, `rayon` | メモリマップドファイル高速走査、ゼロ型破壊保護、エンコーディング変換 |

---

## 🎯 開発・品質ルール

### 1. 技術解説への配慮
- ボスの他言語経験を尊重し、Rust/React/TypeScript固有の概念（所有権、ライフタイム、Reactフック等）は一般的なプログラミング概念や具体例を交えて分かりやすく補足解説を添えること。

### 2. ゼロ型破壊の原則（Zero-Type-Mutation）
- Excelのような自動型変換（先頭ゼロ削除、勝手な日付・指数表記変換等）は絶対に起こさないこと。
- すべてのセルデータは厳格にリテラル文字列として扱い、元の文字列表現を完全維持すること。

### 3. 事前検証とドキュメント同期（スキル委譲）
- ソースコード変更時は [tauri-verification スキル](file:///.agents/skills/tauri-verification/SKILL.md) に沿って 6大事前強制検証（Rust + TS/Vitest）を実行すること。
- Markdown（`*.md`）のみの変更時は、事前検証を省略し迅速に対応すること。

### 4. コード規模とリファクタリング
- 単一ソース (`*.ts`, `*.tsx`, `*.rs`) が 1,000 行を超えた場合はモジュール分割リファクタリングを積極的に提案・推進すること。

### 5. リリース自動化プロトコル（スキル委譲）
- ボスから「リリースして」とチャットで指示された際は、[release-automation スキル](file:///.agents/skills/release-automation/SKILL.md) の手順に従ってバージョン同期・検証・タグ作成・Push を実行すること。

### 6. コミットメッセージ規約と安全コミット（スキル委譲）
- ボスから指示があった場合のみ、[git-commit スキル](file:///.agents/skills/git-commit/SKILL.md) に従って Conventional Commits + 日本語による安全なコミットを実行すること。

### 7. ドキュメント作図（スキル委譲）
- アーキテクチャやフローの視覚化は [mermaid-diagram スキル](file:///.agents/skills/mermaid-diagram/SKILL.md) に従って Mermaid 記法を使用すること。
