# Release Guide

**English** | [日本語版](../../docs/ja/RELEASE.md)

---

## 1. Versioning Standard

QuCSVPreview follows **Semantic Versioning 2.0.0 (SemVer)**:

- **MAJOR (X.0.0)**: Incompatible architectural shifts or breaking changes.
- **MINOR (0.X.0)**: Backwards-compatible new features.
- **PATCH (0.0.X)**: Backwards-compatible bug fixes and small performance improvements.

---

## 2. Release Steps

### 1. Update Version Identifiers
- `package.json` (`"version"`)
- `src-tauri/tauri.conf.json` (`"version"`)
- `src-tauri/Cargo.toml` (`version`)

### 2. Update CHANGELOG.md
- Move items from `[Unreleased]` into the new release header with the current date.

### 3. Commit & Tag
```bash
git commit -am "chore(release): v0.1.0"
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin main --tags
```

### 4. Automated GitHub Actions Build
- Pushing the tag automatically triggers `.github/workflows/release.yml`.
- Tauri action builds signed Windows installers (`.msi`, `.exe`) and portable `.zip` archives directly to GitHub Releases.
