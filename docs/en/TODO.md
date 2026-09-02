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
| **Rendering & Perf** | 2D Virtual Scrolling Engine (Horizontal Column Virtualize)  | 🔴 **High**     | ✅ **Completed**     | v1.1.2         |
| **D&D Operations**   | Enhanced Drag & Drop with Floating Overlay & File Switch    | 🔴 **High**     | ✅ **Completed**     | v1.1.2         |
| **Clipboard & Copy** | 0ms Local TSV Copying & Dual `execCommand` Fallback         | 🔴 **High**     | ✅ **Completed**     | v1.1.2         |
| **Search & Replace** | Batch Find & Replace Dialog with RegEx (`Ctrl + H`)         | 🔴 **High**     | ✅ **Completed**     | v1.1.0         |
| **Editing & Input**  | Rectangular TSV/CSV Clipboard Paste (`Ctrl + V`)            | 🔴 **High**     | ✅ **Completed**     | v1.1.0         |
| **UI & Layout**      | Double-click Header Boundary to Auto-Fit Width              | 🔴 **High**     | ✅ **Completed**     | v1.1.0         |
| **Data Quality**     | Selection Quick Stats Preview (Sum, Avg, Count, Min, Max)   | 🟡 **Medium**   | ✅ **Completed**     | v1.1.0         |
| **Usability**        | Recent Files History & Quick Reload                         | 🟢 **Low / Ext**| ✅ **Completed**     | v1.1.0         |
| **Sorting**          | Multi-Column Composite Sorting via Shift+Click              | 🟡 **Medium**   | 📋 Proposed (TODO)   | v1.2.0         |
| **Data Quality**     | Duplicate Rows / Values Detection & Color Highlighting       | 🟡 **Medium**   | 📋 Proposed (TODO)   | v1.2.0         |
| **UI & Operations**  | Drag-and-Drop Column Header Reordering                      | 🟡 **Medium**   | 📋 Proposed (TODO)   | v1.3.0         |
| **File Operations**  | High-Speed Multi-CSV Merging & Combined Export              | 🟡 **Medium**   | 📋 Proposed (TODO)   | v1.3.0         |
| **Data Comparison**  | Cell-by-Cell Visual CSV Difference Comparison (CSV Diff)    | 🟡 **Medium**   | 📋 Proposed (TODO)   | v1.3.0         |
| **Data Analysis**    | Column Data Profiler (Unique, Missing, Cardinality, Stats)  | 🟢 **Low / Ext**| 📋 Proposed (TODO)   | v1.4.0         |
| **CLI & Automation** | Headless CLI Mode for Batch Splitting & Encoding Conversion | 🟢 **Low / Ext**| 📋 Proposed (TODO)   | v1.4.0         |

---

## 🛠️ Detailed Feature Specifications & Proposals

### 1. High Priority — Immediate Productivity Boosters (Completed ✅)

#### ✅ 1.1 2D Virtual Scrolling Engine (Horizontal Column Virtualization)
- **Overview**: Dynamically slice viewport columns (10–15) to reduce DOM elements by 96.6% on wide CSVs (200+ cols). Reduced cell click/selection lag from 1,000ms to 2ms.
- **Implementation**: Absolute CSS coordinates via `renderStartCol`/`renderEndCol` and wide chunk prefetching (2,000-row chunks / 100,000 cached rows).

#### ✅ 1.2 Enhanced Drag & Drop with Animated Full-Window Overlay
- **Overview**: Full-window drag detection displaying an animated overlay, allowing instant file switching even during table view.
- **Implementation**: Full support for both native Tauri v2 drop events and HTML5 drag & drop.

#### ✅ 1.3 Reliable 0ms TSV Clipboard Copy
- **Overview**: Instant 0ms TSV generation directly from local memory cache with automatic `document.execCommand('copy')` fallback upon lost window focus.

---

### 2. Medium Priority — Data Analysis & Quality Control (Upcoming)

#### 📋 2.1 Multi-Column Composite Sorting (Shift+Click)
- **Overview**: Enable multi-key sorting (e.g. Primary: Category Ascending, Secondary: Price Descending) by passing sort arrays to Rayon parallel iterators in Rust.

#### 📋 2.2 Duplicate Value & Row Detection
- **Overview**: Fast hash-set scan in Rust backend to highlight duplicate keys/rows across massive datasets in milliseconds.

#### 📋 2.3 Drag-and-Drop Column Reordering
- **Overview**: Visually drag column headers to reorder column layout in real time, with updated column order persisting into saved CSV outputs.

#### 📋 2.4 Multi-CSV High-Speed Merging (Merge Export)
- **Overview**: Select multiple chunked CSV files sharing the same column schema and stream-concatenate them into a single consolidated file.

#### 📋 2.5 Visual CSV Diff Viewer
- **Overview**: Select two CSV files to compare cells, visually highlighting modified (yellow), inserted (green), and deleted (red) rows.

---

### 3. Low Priority & Extended Ideas

#### 📋 3.1 Column Data Profiler (Quick Statistics)
- **Overview**: Right-click header to open Column Analysis: inspect unique value counts, missing values (NULL/empty), modes, min/max lengths, and data type distribution.

#### 📋 3.2 Headless CLI Mode (`qucsview --split 10000 input.csv` / `qucsview --convert sjis-to-utf8 input.csv`)
- **Overview**: Execute chunk splitting and encoding conversions directly from terminal scripts without launching the GUI.

---

## ✅ Completed Milestones

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
- [x] High-speed CSV file splitting export modal (`SplitModal`).
- [x] Refactored Rust native core (`csv_engine`) into single-responsibility submodules.
- [x] GitHub Actions automated compile & CI workflow (`ci.yml`).
- [x] GitHub Actions automated release CD workflow (`release.yml`) & one-command release script.

### Phase 6: 2D Virtualization & Extreme Multi-Column Speed (Completed ✅)
- [x] Horizontal Column Virtualization slashing DOM elements by 96.6% on 200+ column files.
- [x] Cell click & selection latency reduced from 1,000ms to 2ms.
- [x] Full-screen Drag & Drop overlay with instant active table file switching.
- [x] Instant 0ms local TSV clipboard copying with dual fallbacks.
- [x] Eliminated Vite + Cargo binary file watch lock conflicts (EBUSY).
