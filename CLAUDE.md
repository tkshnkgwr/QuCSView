# CLAUDE.md — AIアシスタント最優先ルール

> [!IMPORTANT]
> This file constraints the behavior of Claude (Cline/Roo Code etc.) in this workspace (**QuCSView**).

## 📜 Absolute System Rules (Load RULES.md)
When working in this workspace, you MUST load and strictly adhere to the following global rules as the highest priority:

👉 **[Global Rules (RULES.md)](./RULES.md)**
👉 **[Agent Guidelines (.agents/AGENTS.md)](./.agents/AGENTS.md)**

- Apply the rules specified in `RULES.md` ("No auto-commit/push", "Vertical alignment of Markdown tables", "Address the user as 'ボス' in Japanese", "Use Mermaid for diagrams", "Skip pre-verification on Markdown-only changes") without exception.
- Perform a self-check against the above rules before every tool execution and file write.
- For source code changes (`*.rs`, `*.ts`, etc.), strictly execute the pre-commit verification steps (Rust: `cargo fmt`, `cargo check`, `cargo clippy`, `cargo test` / TypeScript: `npm run lint`, `npm run test`). Skip these checks when only Markdown files (`*.md`) are modified.
- When instructed by the user (ボス) to "リリースして" (release), follow the release protocol in `.agents/AGENTS.md` (synchronize version, execute full verification, create tag, and push).


