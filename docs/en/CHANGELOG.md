# Changelog

**English** | [日本語版](../../docs/ja/CHANGELOG.md)

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [1.0.0] - 2026-08-26

### Added
- **Official General Availability Release (v1.0.0)**:
  - Stable, high-speed preview & in-place cell editing for massive 500MB+ CSV/TSV files with zero memory bloat.
  - Completed single-responsibility modular refactoring of Rust native core (`csv_engine`: `grid`, `io`, `search`, `types`, `tests`).
  - Automated GitHub Actions CI workflow (`.github/workflows/ci.yml`) and Release CD workflow (`.github/workflows/release.yml`).
  - TypeDoc HTML documentation generation and full Rustdoc coverage.
  - Native IPC handlers for clipboard TSV extraction, dynamic encoding switches, and column/row data queries.

---

## [0.3.0] - 2026-08-26

### Added
- **Structural Row & Column Editing via Right-Click Context Menu (`TableContextMenu.tsx`, `VirtualTable.tsx`, `csvWorker.ts`, `tauriBridge.ts`, `App.tsx`)**:
  - Right-clicking any cell, row index header, or column header opens a context menu with options to insert, duplicate, or delete rows and columns.
- **Full Undo / Redo History Stack (`App.tsx`, `VirtualTable.tsx`, `Toolbar.tsx`, `types/csv.ts`, `HelpModal.tsx`)**:
  - Full bidirectional rollbacks and reapplications via `Ctrl + Z` and `Ctrl + Y` / `Ctrl + Shift + Z` (or toolbar buttons) for both cell value edits and structural row/column modifications.
- **High-Speed Large CSV File Splitting (`SplitModal.tsx`, `Toolbar.tsx`, `csvWorker.ts`, `tauriBridge.ts`, `App.tsx`)**:
  - Added dedicated chunk-splitting modal to split massive datasets by row counts (e.g. 1,000 / 10,000 rows) with automatic header retention and batch/single downloads.
- **Instant Toggle between Table Preview & Raw Text Mode (`Toolbar.tsx`, `RawTextView.tsx`, `App.tsx`)**:
  - One-click seamless synchronization switch between high-speed grid preview and direct raw text editor.
- **Visual Highlight of Unsaved Cells (`VirtualTable.tsx`, `Toolbar.tsx`)**:
  - Unsaved modified cells receive an amber accent highlight and badge counter until committed.

---

## [0.2.1] - 2026-08-21

### Changed
- **Application Renaming (`metadata.json`, `TitleBar.tsx`, `HelpModal.tsx`, `tauri.conf.json`, `index.html`)**:
  - Renamed the application from `QuCSVPreview` to **`QuCSView`**.

---

## [0.1.3] - 2026-08-21

### Added
- **Row Selection by Row Number Click (`VirtualTable.tsx`)**:
  - Clicking any sticky row number cell immediately selects the entire row and focuses the first column.
  - Interactive hover state and descriptive tooltip added to row number cells.

### Changed / Improved
- **Selected Row Highlighting (`VirtualTable.tsx`)**:
  - Selected row number cell is highlighted with bright blue background (`bg-blue-600`) and bold white text (`text-white font-bold`).
  - Entire row is highlighted with a crisp, high-contrast background in both dark and light modes.

---

## [0.1.0] - 2026-08-20

### Added
- **Core Engine (Rust `src-tauri/src/csv_engine.rs`)**:
  - Memory-mapped file I/O using `memmap2` for instantaneous offset table indexing (< 1.0s on 500MB files).
  - Fast single-pass line offset scanner supporting both `CRLF` and `LF`.
  - In-memory atomic cell modification sparse-buffer (`HashMap<(usize, usize), String>`).
  - Safe, streaming direct file writer with full `Shift_JIS (CP932)`, `UTF-8`, `UTF-8 BOM`, and `EUC-JP` support.
  - Multi-threaded full-text and column-specific substring search with `original_row_indices` preservation.
- **Frontend Layer (React 19 + TypeScript + Tailwind CSS)**:
  - High-performance virtualized viewport (`VirtualTable.tsx`) rendering only 30–50 rows in DOM.
  - Sticky row index column (`#`) fixed at `left: 0` with opaque background on horizontal scroll.
  - True physical row number tracking during search filtering (Filter Mode).
  - Direct in-place cell editing with zero type conversion (Excel-corruption prevention).
  - Comprehensive Help & Shortcut modal (`HelpModal.tsx`, `F1` / `?` button).
  - Theme switching engine (`useTheme.ts`) with Dark, Light, and System OS sync.
- **IPC & Architecture (`tauriBridge.ts`, `services/csvWorker.ts`)**:
  - Robust Tauri v2 IPC bridge with fallback to dedicated Web Worker for browser simulation.
  - 1-second low-frequency status bar heartbeat for minimal CPU footprint.

### Changed / Improved
- **UI Optimization (`TitleBar.tsx`)**:
  - Compact icon-only display for "Help" and "Always on Top (Pin)" buttons in the title bar, maximizing space for file path and metadata display.
  - Retained full accessibility via `title` tooltips and `aria-label`.
- **Cell Editing & Status Bar Sync (`VirtualTable.tsx`, `App.tsx`, `StatusBar.tsx`)**:
  - Introduced optimistic UI updates upon cell editing commit, resolving value inconsistency during consecutive multi-cell edits.
  - Real-time synchronization of active cell value and byte size to the status bar upon cell selection, keyboard navigation, and slice changes.
- **Search Keyword Color Highlighting (`VirtualTable.tsx`, `App.tsx`)**:
  - High-contrast visual `<mark>` highlighting for substring matches within all cell values (Yellow/Amber).
  - Accurate substring matching adhering to the Case-Sensitive toggle.
  - Distinct ambient background tint for cells with matches and a prominent focus ring (`ring-2 ring-amber-400`) for the active search target.
- **File Save Settings & Export Modal (`SaveModal.tsx`, `App.tsx`, `tauriBridge.ts`, `csvWorker.ts`, `csv_engine.rs`)**:
  - Comprehensive dialog upon clicking Save or pressing `Ctrl + S` allowing custom file paths, delimiter conversion (CSV/TSV/semicolon/pipe), character encodings, and line endings.
  - Automatic file extension suggestions based on selected delimiter.

### Fixed
- **TitleBar Raw Comment Leak (`TitleBar.tsx`)**:
  - Fixed syntax error where an internal update annotation comment was rendered as plain text in the title bar next to the help button.
