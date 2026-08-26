# User Guide

**English** | [日本語版](../../docs/ja/USER_GUIDE.md)

---

## 1. Introduction

**QuCSVPreview** is a high-speed desktop tool engineered to preview, edit, and save large CSV and TSV files (up to 500MB+) instantly, while providing 100% immunity against Excel's destructive automatic type conversions (such as stripping leading zeros or corrupting string literals).

---

## 2. Installation

### Windows Installer
1. Download the latest `QuCSVPreview_x64-setup.exe` from the GitHub Releases page.
2. Run the installer and follow the on-screen steps.

### Portable Version (.zip)
1. Download and extract `QuCSVPreview_portable.zip`.
2. Launch `QuCSVPreview.exe` directly without registry modifications.

---

## 3. Basic Operations

### 3.1 Opening Files
- **Drag & Drop**: Drag your CSV/TSV file from Windows Explorer into the application window.
- **Toolbar / Shortcut**: Click **Open** or press **`Ctrl + O`**.

### 3.2 Navigation & Sticky Row Header
- **Scroll**: Smooth virtual scrolling keeps only 30–50 rows in DOM memory.
- **Keyboard**: Use Arrow keys (`↑`, `↓`, `←`, `→`), `PageUp`, and `PageDown` to navigate.
- **Sticky Row Index**: The leftmost `#` row index column stays anchored on horizontal scrolling.

### 3.3 Direct In-Place Cell Editing
1. Double-click any cell or press **`Enter` / `F2`**.
2. Type the new value (leading zeros and raw strings are 100% preserved).
3. Press **`Enter`** to commit down, **`Tab`** to commit right, or **`Esc`** to cancel and revert.

### 3.4 Full-Text Search & Filter Mode
1. Press **`Ctrl + F`** and type your query.
2. Cycle through matches with **`Enter`** (next) and **`Shift + Enter`** (previous).
3. Click the **Filter** button in the search bar to isolate matching rows while maintaining the **original physical file row numbers**.

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
