# Project Roadmap

**English** | [日本語版](../../docs/ja/TODO.md)

---

## 🚀 Release Phases

### Phase 1: Core Engine & Virtual Scroll MVP (Completed ✅)
- [x] Rust `memmap2` zero-copy line-offset indexing.
- [x] React 19 virtual window viewport (rendering 30–50 rows only).
- [x] Frozen leftmost `#` row index column and theme switching (Dark/Light/System).
- [x] `F1` and `?` Help & Shortcut modal.

### Phase 2: In-Place Editing & Safe Saving (Completed ✅)
- [x] In-place direct cell editing via Double-Click / Enter / F2.
- [x] 100% literal string preservation (No leading-zero stripping or date mangling).
- [x] In-memory sparse diff buffer with atomic streaming save (`Ctrl + S`).

### Phase 3: High-Speed Search, Sort & Row Filtering (Completed ✅)
- [x] Full-text substring search (case-sensitive & column-restricted options).
- [x] Match-only Row Filter Mode with original physical row index preservation.
- [x] Single-column Ascending/Descending sorting.

### Phase 4: Extended Character Sets & Productivity Tools (Completed ✅)
- [x] Full `Shift_JIS (CP932)`, `UTF-8`, `UTF-8 BOM`, `EUC-JP` / `CRLF`, `LF` conversions.
- [x] Multi-cell range selection with clipboard TSV copy (`Ctrl + C`, `Ctrl + A`, Drag/Shift-click).
- [x] Full row selection and high-contrast accent highlight by row number click.
- [x] RegEx-powered fast full-text search with error-safety (`.*` toggle).
- [x] One-click toggle between Table Preview & Raw Text Mode (`RawTextView`).
- [x] Visual highlight of unsaved modified cells with amber accents and corner indicators.

### Phase 5: Advanced Table Operations & Data Quality (In Progress 🔄)
- [x] Insert, duplicate, and delete rows/columns with context menu (`TableContextMenu`).
- [x] Edit history with Undo / Redo (`Ctrl + Z` / `Ctrl + Y` / `Ctrl + Shift + Z`).
- [x] High-speed file splitting for large datasets (`SplitModal`).
- [ ] Multi-column composite sorting (Shift + click on headers for multi-level sort).
- [ ] Drag-and-drop column reordering.
- [ ] Double-click column header boundary to auto-fit column width.
- [ ] Batch Search & Replace dialog with RegEx support.
- [ ] Paste rectangular TSV/CSV text blocks from clipboard into cells.
- [ ] Duplicate row detection and quick summary statistics (Sum, Average, Count).
- [ ] High-speed file merging export for multiple CSV files.
