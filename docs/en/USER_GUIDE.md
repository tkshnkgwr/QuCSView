# User Guide

**English** | [日本語版](../../docs/ja/USER_GUIDE.md)

---

## 1. Introduction

**QuCSView** is a high-speed desktop tool engineered to preview, edit, and save large CSV and TSV files (up to 500MB+, 200+ columns) instantly, while providing 100% immunity against Excel's destructive automatic type conversions (such as stripping leading zeros or corrupting string literals).

---

## 2. Installation

### Windows Installer
1. Download the latest `QuCSView_x64-setup.exe` from the GitHub Releases page.
2. Run the installer and follow the on-screen steps.

### Portable Version (.zip)
1. Download and extract `QuCSView_portable.zip`.
2. Launch `QuCSView.exe` directly without registry modifications.

---

## 3. Basic Operations

### 3.1 Opening Files (Drag & Drop & Recent History)
- **Drag & Drop**: Drag CSV/TSV files from File Explorer directly onto the QuCSView window (displays a full-window animated drop overlay). You can drop new files even while a table is already open.
- **Toolbar / Shortcut**: Click **Open** or press **`Ctrl + O`**.
- **Recent Files**: Click the **History** menu in the Title Bar to reload any of the last 10 opened files with a single click.

### 3.2 Navigation & 2D Virtual Scrolling
- **2D Virtual Scrolling**: Both vertical rows and horizontal columns are dynamically virtualized, delivering butter-smooth 60/120fps scrolling even on massive CSVs with 200+ columns.
- **Keyboard**: Use Arrow keys (`↑`, `↓`, `←`, `→`), `PageUp`, and `PageDown` to navigate.
- **Sticky Row Index**: The leftmost `#` row index column stays anchored on horizontal scrolling.
- **Auto-Fit Column Width**: **Double-click** the right border of any column header to automatically resize the column to fit its longest text content.

### 3.3 Direct In-Place Cell Editing & TSV Copy/Paste
1. **Cell Editing**: Double-click any cell or press **`Enter` / `F2`**. Unsaved edited cells are marked with an orange corner triangle.
2. **TSV Copy**: Select cells or rows and press **`Ctrl + C`** to copy TSV-formatted data to the clipboard in 0ms.
3. **Rectangular Paste**: Press **`Ctrl + V`** to paste 2D clipboard data starting from the active cell (Undo-supported).
4. **Undo / Redo**: Press **`Ctrl + Z`** to revert cell edits, pastes, replacements, or row/column modifications. Press **`Ctrl + Y`** (or `Ctrl + Shift + Z`) to redo.
5. **Row / Column Structural Operations**: **Right-click** any cell, row header, or column header to insert, duplicate, or delete rows and columns.

### 3.4 Full-Text Search, Find & Replace (`Ctrl+H`), and Filter Mode
1. Press **`Ctrl + F`** and type your query.
2. Cycle through matches with **`Enter`** (next) and **`Shift + Enter`** (previous).
3. **Find & Replace (`Ctrl + H`)**: Open the replacement dialog to execute single or batch regex replacements with capture groups (`$1`).
4. Click the **Filter** button in the search bar to isolate matching rows while maintaining the **original physical file row numbers**.

### 3.5 Encoding & Line-Ending Conversion
- Select the desired encoding (`UTF-8`, `Shift_JIS`, `EUC-JP`) and line ending (`CRLF`, `LF`) from the toolbar dropdowns.
- Press **`Ctrl + S`** to save changes safely.

---

## 4. Key Use Cases

1. **E-Commerce & ERP Product Catalogs**:
   - Safely edit product SKU codes (e.g. `00049102`) and barcode numbers without Excel mangling leading zeros.
2. **Legacy Shift_JIS (CP932) File Maintenance**:
   - Inspect and modify Japanese legacy system files without garbled text (mojibake).
3. **Massive Log & Telemetry Inspection**:
   - Instantly search through multi-gigabyte log dumps without UI freezes.

---

## 5. Frequently Asked Questions (FAQ)

- **Q: Does it support spreadsheet formula calculations like Excel SUM?**
  - **A:** No. QuCSVPreview is strictly optimized as a fast, type-safe literal string previewer and editor.
- **Q: Does opening a 500MB CSV exhaust PC memory?**
  - **A:** No. Thanks to Rust memory-mapping (`memmap2`), RAM consumption remains under 40MB even on low-end machines.
