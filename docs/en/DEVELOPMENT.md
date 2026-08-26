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

### Run Linter & Type Checks
```bash
npm run lint
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
