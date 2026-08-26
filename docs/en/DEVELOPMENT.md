# Development & Build Guide

**English** | [日本語版](../../docs/ja/DEVELOPMENT.md)

---

## 1. Prerequisites

- **Node.js**: v20.x or higher (LTS recommended)
- **Rust**: v1.75.0 or higher (stable channel)
- **C++ Build Tools**: Visual Studio 2022 C++ Build Tools (for Windows builds)
- **Package Manager**: npm or pnpm

---

## 2. Development Commands

### Install Dependencies
```bash
npm install
```

### Run Tauri Desktop App in Dev Mode (Hot Reload)
```bash
npm run tauri dev
```

### Run Web Prototype in Browser (Worker Fallback Mode)
```bash
npm run dev
```

### Run Unit Tests
```bash
# Rust backend unit tests
cargo test --manifest-path src-tauri/Cargo.toml

# Frontend Vitest unit tests
npm run test
```

### Run Linter & Type Checks
```bash
# TypeScript type check
npm run lint

# Rust formatting & Clippy analysis
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

### Generate API Documentation
```bash
# TypeDoc (TypeScript API) -> docs/api/
npm run doc

# Rustdoc (Rust Backend API) -> src-tauri/target/doc/
cargo doc --manifest-path src-tauri/Cargo.toml --no-deps
```

---

## 3. Production Build

### Generate Windows Executables & Installers
```bash
npm run tauri build
```
Artifacts are generated in `src-tauri/target/release/bundle/` (`.msi`, `.exe`, portable binaries).

---

## 4. Debugging

- **Frontend**: Press `F12` inside the app window to open DevTools.
- **Backend (Rust)**: Set `RUST_LOG=debug` before running `npm run tauri dev`.
