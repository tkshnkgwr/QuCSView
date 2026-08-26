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

### 3. 事前検証とドキュメント同期
- **ソースコード変更時（`*.rs`, `*.ts`, `*.tsx` 等）**:
  コミット前の段階で以下の **「事前強制検証」を必ずローカルで全自動実行** し、1件の警告・エラーも残さないこと：
  1. `cargo fmt --manifest-path src-tauri/Cargo.toml --check` （Rust コード整形検証）
  2. `cargo check --manifest-path src-tauri/Cargo.toml` （Rust コンパイル・型検証）
  3. `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` （Clippy 厳格品質検証）
  4. `cargo test --manifest-path src-tauri/Cargo.toml` （Rust ユニットテスト検証）
  5. `npm run lint` （TypeScript 型検証 / `tsc --noEmit`）
  6. `npm run test` （Vitest ユニットテスト検証）
- **Markdown のみの変更時（`*.md` のみ）**:
  - Rust / TypeScript の事前検証は **省略** し、迅速かつ柔軟に対応すること。

### 4. コード規模とリファクタリング
- 単一ソース (`*.ts`, `*.tsx`, `*.rs`) が 1,000 行を超えた場合はモジュール分割リファクタリングを積極的に提案・推進すること。

### 5. リリース自動化プロトコル（「リリースして」指示時の対応）
- ボスから **「リリースして」** とチャットで指示された際は、以下のリリース手順を全自動で実行すること：
  1. `node scripts/release.js patch` （またはボス指定のバージョン）を実行し、`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` のバージョンを完全同期。
  2. 6大事前強制検証（`cargo fmt`, `check`, `clippy`, `test`, `npm run lint`, `test`）を全自動実行。
  3. バージョン更新ファイルをコミットし、`vX.Y.Z` の Git タグを作成して `origin/main` およびタグラベルを Push。
  4. GitHub Actions Release ワークフローの発動を確認し、ボスへ報告。

### 6. コミットメッセージ言語規約（Conventional Commits + 日本語）
- ボスからコミットの指示を受けた際、コミットメッセージは以下の規約に従って記述すること：
  1. **接頭辞（Prefix）**: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `release:` などの Conventional Commits 形式（英語）とする。
  2. **件名・本文・箇条書き詳細**: すべて **日本語** で記述し、変更内容や目的を分かりやすく簡潔に記録すること。



