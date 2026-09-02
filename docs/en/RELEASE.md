# Release & Packaging Guide (RELEASE)

**English** | [日本語版](../../docs/ja/RELEASE.md)

---

## 1. Versioning Specification

This project complies with **Semantic Versioning 2.0.0** (`MAJOR.MINOR.PATCH`, e.g., `0.1.1`).

- **MAJOR**: Breaking UI or data structure modifications
- **MINOR**: Backward-compatible new features
- **PATCH**: Backward-compatible bug fixes and small improvements

---

## 2. Release Checklist (Single Source Versioning)

When releasing a new version, the following files are synchronized:

| Item                     | Location                                  |
| :----------------------- | :---------------------------------------- |
| Frontend Standard Version| [`package.json`](../../package.json)      |
| Rust Crate Version       | [`src-tauri/Cargo.toml`](../../src-tauri/Cargo.toml) |
| Tauri Application Config | [`src-tauri/tauri.conf.json`](../../src-tauri/tauri.conf.json) |
| Japanese Changelog       | [`docs/ja/CHANGELOG.md`](../ja/CHANGELOG.md) |
| English Changelog        | [`docs/en/CHANGELOG.md`](CHANGELOG.md)    |

---

## 3. Automated CI / CD Workflows (GitHub Actions)

### 3.1 CI Workflow (`.github/workflows/ci.yml`)

- **Trigger**: `push` to `main` branch (excluding markdown changes) and `pull_request`
- **Actions**:
  - TypeScript type check (`npm run lint`)
  - Vitest unit tests (`npm run test`)
  - Rust formatting & Clippy analysis (`cargo fmt`, `cargo clippy`)
  - Rust unit tests (`cargo test`)
  - Tauri backend compile check (`cargo check`)

### 3.2 Automated Release Workflow (`.github/workflows/release.yml`)

- **Trigger**: `push` of `v*` tags (e.g. `git push origin v0.1.1`) or manual trigger (`workflow_dispatch`)
- **Actions**:
  - Full automated pre-checks
  - Full automated build of Windows desktop application binaries (`.msi` / `.exe` installers) via `tauri-apps/tauri-action`
  - Automatic publishing to GitHub Releases

---

## 4. Release Execution Guide

### One-Command Version Bump
```bash
# patch version bump (e.g., 0.1.0 -> 0.1.1)
npm run release

# minor version bump (e.g., 0.1.0 -> 0.2.0)
npm run release minor

# major version bump (e.g., 0.1.0 -> 1.0.0)
npm run release major
```

### Git Commit, Tag & Push
```bash
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "release: bump version to v0.1.1"
git tag v0.1.1
git push origin main
git push origin v0.1.1
```
