# Project Roadmap & Implementation Plan (TODO)

**English** | [日本語版](../../docs/ja/TODO.md)

---

## 🎯 Roadmap Overview

With the official release of **v1.0.0**, QuCSView has established a rock-solid foundation for massive 500MB+ CSV/TSV handling: zero-type mutation, instant previewing, in-place editing, character encoding conversion, file splitting, and automated GitHub Actions CI/CD.

Future development focuses on enhanced spreadsheet-like editing ergonomics (rectangular paste, find/replace, auto-fit widths) and enterprise-grade data quality features (quick statistics, duplicate detection, batch file merging).

---

## 📊 Implementation Status & Priorities Matrix

| Feature Category     | Feature / Proposal                                          | Priority        | Status               | Target Version |
| :------------------- | :---------------------------------------------------------- | :-------------- | :------------------- | :------------- |
| **Search & Replace** | Batch Find & Replace Dialog with RegEx (`Ctrl + H`)         | 🔴 **High**     | ✅ **Completed**     | v1.1.0         |
| **Editing & Input**  | Rectangular TSV/CSV Clipboard Paste (`Ctrl + V`)            | 🔴 **High**     | ✅ **Completed**     | v1.1.0         |
| **UI & Layout**      | Double-click Header Boundary to Auto-Fit Width              | 🔴 **High**     | ✅ **Completed**     | v1.1.0         |
| **Data Quality**     | Selection Quick Stats Preview (Sum, Avg, Count, Min, Max)   | 🟡 **Medium**   | ✅ **Completed**     | v1.1.0         |
| **Usability**        | Recent Files History & Quick Reload                         | 🟢 **Low / Ext**| ✅ **Completed**     | v1.1.0         |
| **Sorting**          | Multi-Column Composite Sorting via Shift+Click              | 🟡 **Medium**   | 📋 Proposed (TODO)   | v1.2.0         |
| **Data Quality**     | Duplicate Rows / Values Detection & Color Highlighting       | 🟡 **Medium**   | 📋 Proposed (TODO)   | v1.2.0         |
| **UI & Operations**  | Drag-and-Drop Column Header Reordering                      | 🟡 **Medium**   | 📋 Proposed (TODO)   | v1.3.0         |
| **File Operations**  | High-Speed Multi-CSV Merging & Combined Export              | 🟡 **Medium**   | 📋 Proposed (TODO)   | v1.3.0         |
| **CLI & Automation** | Headless CLI Mode for Batch Splitting & Encoding Conversion | 🟢 **Low / Ext**| 📋 Proposed (TODO)   | v1.4.0         |

---

## 🛠️ Detailed Feature Specifications & Proposals

### 1. High Priority — Immediate Productivity Boosters

#### 📋 1.1 Rectangular Clipboard Paste (`Ctrl + V`)
- **Overview**: Paste multi-row/multi-column TSV or CSV blocks from external spreadsheets or editors starting at the active cell.
- **Design**: Parse clipboard text with `CsvParser.parseLine` and update `modified_cells` or `in_memory_rows` atomically with full Undo support.

#### 📋 1.2 Batch Find & Replace Dialog (`Ctrl + H`)
- **Overview**: Search and replace cell strings across the whole table or within specific columns, supporting PCRE capture group substitutions.
- **Design**: Batch update matched coordinates from `search.rs` with preview count verification.

#### 📋 1.3 Double-Click Column Header Auto-Fit
- **Overview**: Double-clicking a header resize handle auto-adjusts column width to the maximum length of visible cells and the header string.

---

### 2. Medium Priority — Data Analysis & Quality Control

#### 📋 2.1 Selection Quick Stats in Status Bar
- **Overview**: Instantly compute and display stats for selected ranges: Count, Numeric Count, Sum, Average, Min, Max in the bottom status bar.

#### 📋 2.2 Duplicate Value & Row Detection
- **Overview**: Fast hash-set scan in Rust backend to highlight duplicate keys/rows across massive datasets in milliseconds.

#### 📋 2.3 Multi-CSV High-Speed Merging (Merge Export)
- **Overview**: Select multiple chunked CSV files sharing the same column schema and stream-concatenate them into a single consolidated file.

---

### 3. Low Priority & Extended Ideas

#### 📋 3.1 Recent Files History
- Cache last 5–10 opened files and encoding preferences for one-click reopening.

#### 📋 3.2 Headless CLI Mode (`qucsview --split 10000 input.csv`)
- Execute chunk splitting and encoding conversions directly from terminal scripts without launching the GUI.

---

## ✅ Completed Milestones (v1.0.0 Achieved)

### Phase 1: Core Engine & Virtual Viewport (Completed ✅)
- [x] Rust `memmap2` zero-copy line-offset indexing.
- [x] React 19 virtual window viewport (rendering 30–50 rows only).
- [x] Frozen `#` row index column and true physical line tracking (1-indexed).
- [x] Dark / Light / System UI theme switcher.

### Phase 2: In-Place Editing & Zero-Type-Mutation (Completed ✅)
- [x] In-place direct cell editing via Double-Click / Enter / F2.
- [x] 100% literal string preservation (No leading-zero stripping or date mangling).
- [x] In-memory sparse diff buffer with atomic streaming save (`Ctrl + S`).
- [x] 1-indexed sequential numbers (`1, 2, 3...`) for headerless files.

### Phase 3: High-Speed Search, Sort & Row Filtering (Completed ✅)
- [x] Full-text substring search (case-sensitive & column-restricted options).
- [x] Match-only Row Filter Mode with original physical row index preservation.
- [x] Single-column Ascending/Descending sorting.
- [x] PCRE-compatible RegEx search with safety guards and `<mark>` highlights.

### Phase 4: Extended Character Sets & Productivity Tools (Completed ✅)
- [x] Full `Shift_JIS (CP932)`, `UTF-8`, `UTF-8 BOM`, `EUC-JP` / `CRLF`, `LF` conversions.
- [x] Multi-cell range selection with clipboard TSV copy (`Ctrl + C`, `Ctrl + A`, Drag selection).
- [x] Full row selection with high-contrast accent highlight by row number click.
- [x] One-click toggle between Table Preview & Raw Text Mode (`RawTextView`).
- [x] Visual highlight of unsaved modified cells with amber accents and corner badges.

### Phase 5: Structural Ops, Modular Architecture & CI/CD (Completed ✅)
- [x] Right-click structural context menu (`TableContextMenu`) for row/col insert, duplicate, delete.
- [x] Complete bidirectional Undo / Redo history stack (`Ctrl + Z` / `Ctrl + Y` / `Ctrl + Shift + Z`).
- [x] Chunked CSV file splitting modal (`SplitModal`).
- [x] Single-responsibility modular refactoring of Rust native core (`csv_engine`).
- [x] Automated GitHub Actions CI workflow (`ci.yml`) and Release CD workflow (`release.yml`).
