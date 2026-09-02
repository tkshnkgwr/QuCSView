# Functional & UI Specification

**English** | [日本語版](../../docs/ja/SPEC.md)

---

## 1. Overview

| Field | Description |
| :--- | :--- |
| **Application Name** | QuCSView (Quick & Minimal CSV Previewer & Cell Editor) |
| **Concept** | Modern revival of the classic Japanese editor "ViVi" table view & in-place editing, combined with 100% protection against Excel's destructive automatic type mutations |
| **Target Platform** | Windows 10 / 11 (x64 / ARM64) |
| **Tech Stack** | Rust (Tauri v2) / React 19 / TypeScript / Tailwind CSS / memmap2 |
| **Resource Goals** | 500MB File Load `< 1.0s`, Idle RAM `< 40MB`, CPU Usage `< 0.1%` |

---

## 2. Zero-Type-Mutation Policy (Excel Corruption Immunity)

When opening tabular data in Microsoft Excel, multiple destructive auto-conversions occur silently. QuCSView **completely eliminates** these issues:

1. **Leading Zero Retention**:
   - Numeric codes like `0123` or `00987654` are strictly treated as **literal strings**, never stripped down to `123`.
2. **Unprompted Date Conversion Prevention**:
   - String literals such as `1-2` or `2026/08` are preserved verbatim, preventing Excel from turning them into date objects.
3. **Exponential Scientific Notation Prevention**:
   - Long identifier strings (e.g. `1234567890123456`) are never truncated to `1.23457E+15`.

---

## 3. Supported File Formats & Encodings

### 3.1 Delimiters
- **CSV (Comma-Separated Values)**: `,`
- **TSV (Tab-Separated Values)**: `\t`
- **Custom Delimiters**: Semicolon (`;`), Pipe (`|`)

### 3.2 Encodings & Line Endings
- **Character Encodings**: `UTF-8`, `UTF-8 with BOM`, `Shift_JIS (CP932 / Windows-31J)`, `EUC-JP`
- **Line Endings**: `CRLF` (Windows standard), `LF` (Unix/Linux standard)
- **Auto-Detection**: Automatic heuristic detection upon load; instant manual override from the toolbar.

---

## 4. UI Architecture & Components

```
+----------------------------------------------------------------------------------------------------+
| [FileSpreadsheet] QuCSView | /data/users.csv | 100,000 rows x 12 cols [🌗 Theme] [?] [📌]          |
+----------------------------------------------------------------------------------------------------+
| [Open] [Save (3*)] [↶ Undo] [↷ Redo] [✂ Split] [⊞ Table / 📄 Text] [☑ Header] | [1/24 ▲▼] [🔍 Search] |
+----------------------------------------------------------------------------------------------------+
| # (Row)| ID           | Name         | PostalCode | Phone          | Status       |
+--------+--------------+--------------+------------+----------------+--------------+
| 1      | 0001092      | Tanaka Taro  | 060-0001   | 09012345678    | Active       |
| 2      | 0001093      | Suzuki Ichiro| 060-0002   | 08098765432    | Inactive     |
| 3      | 0001094      | Sato Hanako  | 060-0003   | 09055554444    | Pending      |
| ...    | ...          | ...          | ...        | ...            | ...          |
+----------------------------------------------------------------------------------------------------+
| R: 1 / C: 3 [PostalCode] | Value: "060-0001" (8 B) | 100,000 rows | 3 edits pending | Mem: 99.8%  |
+----------------------------------------------------------------------------------------------------+
```

### 4.1 Sticky Row Index Column & Full Row Selection
- Horizontal scrolling freezes the leftmost row index column (`#`) using `position: sticky; left: 0;`.
- Clicking on a row number immediately selects the entire row with high-contrast accent highlights.

### 4.2 TSV Clipboard Copy (`Ctrl + C`)
- Range selection using Shift+Click, Shift+Arrows, Mouse Drag, or `Ctrl + A` (Select All).
- Copies clean Tab-Separated Values (TSV) directly to clipboard with a confirmation floating toast.

## 4. UI Architecture & Core Features

### 4.1 Virtual Table Viewport (`VirtualTable`)
- Renders only 30–50 rows in the active DOM viewport via bidirectional dynamic slicing.

### 4.2 RegEx Full-Text Search Bar
- Supports PCRE-compatible regular expressions (e.g., `^\d{3}-\d{4}$`) with zero lag.

### 4.3 High-Contrast Sticky Row Numbers & Row Selection
- Leftmost row number column (`#`) remains frozen on horizontal scrolling.

### 4.4 In-Place Context Menu (`TableContextMenu`)
- **Row actions**: Insert row above/below, duplicate row, delete row.
- **Column actions**: Insert column left/right, duplicate column, delete column.

### 4.5 Full Undo / Redo History Stack
- `Ctrl + Z` to undo and `Ctrl + Y` (or `Ctrl + Shift + Z`) to redo.
- Fully supports both cell text changes and structural row/column modifications.

### 4.6 High-Speed File Splitting (Split CSV)
- Dedicated `SplitModal` to split large datasets by specified line count chunks while automatically maintaining header rows.

### 4.7 Table Preview ⇔ Raw Text Instant Toggle
- Seamless millisecond synchronization switch between virtual grid viewport and raw text editor.

### 4.8 Find & Batch Replace Modal (`FindReplaceModal` / `Ctrl + H`)
- **RegEx & Capture Replacements**: Support PCRE-compatible pattern substitutions (e.g. `(\d{3})(\d{4})` → `$1-$2`).
- **Target Scope**: Table-wide or column-restricted batch replacements.
- **Full Undo / Redo**: Batch replace operations are registered as a single transaction in the Undo history stack for one-click rollback (`Ctrl + Z`).

### 4.9 Rectangular TSV/CSV Clipboard Paste (`Ctrl + V`)
- **2D Matrix Batch Insertion**: Batch paste tabular data from external spreadsheets or text editors starting from the active cell anchor.
- **Atomic Undo**: All inserted cells are recorded as a single batch transaction in the Undo history stack.

### 4.10 Auto-Fit Column Width via Double-Click
- **Smart Width Optimization**: Double-click on any column header boundary to automatically resize the column based on the longest text in the current slice and header.

### 4.11 Real-Time Selection Quick Statistics Preview
- **Instant Aggregations**: Selecting multiple cells automatically displays real-time statistics in the status bar:
  - Count, Numeric Count, Sum, Avg, Min, Max.

### 4.12 Recent Files History & Quick Reload
- **History Tracking**: Retains the last 10 opened files with names, sizes, and timestamps, accessible via the TitleBar history dropdown.

### 4.13 2D Virtual Scrolling Engine (Horizontal Column Virtualization)
- **2D Slice Virtualization**:
  - In addition to vertical row virtualization, horizontal column virtualization (`renderStartCol` to `renderEndCol`) renders only visible columns (10–15) to the DOM.
  - Slashes DOM elements by 96.6% (from 22,050 to ~700) on wide files (200+ columns), reducing cell click latency from 1,000ms to 2ms.

### 4.14 Enhanced Drag & Drop File Loading with Fullscreen Overlay
- **Full-Window Drag Detection**:
  - Dragging CSV/TSV files from File Explorer triggers a semi-transparent floating overlay ("Drop file here to open").
  - Users can drop files onto the window at any time to instantly switch open tables.
  - Seamlessly bridges native Tauri v2 drop events with standard HTML5 drag & drop.

---

## 5. Keyboard Shortcuts

| Shortcut                            | Scope               | Action                                            |
| :---------------------------------- | :------------------ | :------------------------------------------------ |
| **`Ctrl + Z`**                      | Table               | Undo previous edit, paste, replace, or row/col op |
| **`Ctrl + Y` / `Ctrl + Shift + Z`** | Table               | Redo undone action                                |
| **`Right-Click`**                   | Cell / Row / Header | Open structural Context Menu                      |
| **`Ctrl + O`**                      | Global              | Open file dialog                                  |
| **`Ctrl + S`**                      | Global              | Quick save file with current encoding             |
| **`Ctrl + Shift + S`**              | Global              | Open Save As & Export Settings dialog             |
| **`Ctrl + C`**                      | Table               | Copy selected cell range / row as TSV             |
| **`Ctrl + V`**                      | Table               | Paste 2D clipboard TSV/CSV data (Undo-supported)  |
| **`Double-Click Header Border`**    | Header Boundary     | Auto-fit column width to content (Auto-Fit)       |
| **`Ctrl + A`**                      | Table               | Select all cells in the table                     |
| **`Shift + Arrow / Click`**         | Table               | Expand cell range selection                       |
| **`Ctrl + F`**                      | Global              | Focus full-text search input                      |
| **`Ctrl + H`**                      | Global              | Open Find & Replace dialog with RegEx support     |
| **`F1`**                            | Global              | Toggle Help & Shortcuts modal                     |
| **`Enter` / `F2`**                  | Cell Selected       | Begin in-place cell editing                       |
| **`Enter`**                         | Cell Editing        | Commit edit and move down                         |
| **`Tab`**                           | Cell Editing        | Commit edit and move right (`Shift+Tab` for left) |
| **`Esc`**                           | Cell Editing        | Cancel edit and rollback value                    |
| **`Arrow Keys`**                    | Cell Selected       | Move active cell selection                        |
| **`PageUp / PageDown`**             | Cell Selected       | Fast scroll viewport                              |
