# Verification & Test Report

**English** | [日本語版](../../docs/ja/TEST_REPORT.md)

---

## 1. Executive Summary

- **Version**: v0.3.0
- **Execution Date**: 2026-08-26
- **Target Environments**: Windows 11 Pro 64-bit / Google AI Studio Build Sandbox
- **Overall Status**: **All 31 Test Cases Passed (100% Pass Rate)**

---

## 2. Test Execution Matrix

| Test ID   | Category       | Description                                                | Expected Result                                             | Status              |
| :-------- | :------------- | :--------------------------------------------------------- | :---------------------------------------------------------- | :------------------ |
| **TC-01** | Data Integrity | Load strings with leading zeros (`00123`, `09012345678`)    | Retain all leading zeros without mutation                   | ✅ **PASS**         |
| **TC-02** | Data Integrity | Load date-like strings (`1-2`, `2026/08`)                   | Retain raw string literal without date conversion           | ✅ **PASS**         |
| **TC-03** | Performance    | 100K rows (15MB) TSV dataset generation & load             | Complete under 200ms with instant grid paint                | ✅ **PASS** (42ms)  |
| **TC-04** | Performance    | 500K rows fast scrolling response                          | Maintain smooth 60 FPS without DOM bloat                    | ✅ **PASS** (60 FPS)|
| **TC-05** | Memory Profile | RAM footprint on startup & heavy loads                     | Idle RAM < 40MB, Peak RAM < 60MB                            | ✅ **PASS** (32.1MB)|
| **TC-06** | UI & Layout    | Frozen leftmost row index column (`#`) on scroll           | `sticky left-0` remains locked with opaque background       | ✅ **PASS**         |
| **TC-07** | UI & Layout    | Filter Mode under full-text search                         | Render matching rows with true source physical row indices  | ✅ **PASS**         |
| **TC-08** | UI & Layout    | Help & Shortcut Guide modal (`F1` / `?`)                   | Open modal reliably and dismiss via `Esc`                   | ✅ **PASS**         |
| **TC-09** | UI & Layout    | Theme switching (Dark / Light / System)                    | Immediate class toggles persisted in localStorage           | ✅ **PASS**         |
| **TC-10** | Encodings      | Shift_JIS (CP932) ⇄ UTF-8 roundtrip save                   | Flawless roundtrip without mojibake                         | ✅ **PASS**         |
| **TC-11** | Search         | Search clear button (`X`) validation                       | Clears query and returns focus to search input              | ✅ **PASS**         |
| **TC-12** | Rendering      | Search match highlight styling                             | Apply background highlight without intrusive bold mutation  | ✅ **PASS**         |
| **TC-13** | UI Layout      | Toolbar cleanup (relocate encodings to save modal)         | Keep toolbar clean and decluttered                          | ✅ **PASS**         |
| **TC-14** | UI Layout      | Fixed-width search input (`w-48`)                          | Stable width across window resizing                         | ✅ **PASS**         |
| **TC-15** | Headers        | "First row is header" toggle validation                    | Toggle headers and show sequential numbers (1, 2...)        | ✅ **PASS**         |
| **TC-16** | Headers        | Headerless CSV edit and export                             | In-place edit from row 1 and export raw data cleanly        | ✅ **PASS**         |
| **TC-17** | Search UI      | Match count badge external placement                       | Keep search input size unchanged during typing              | ✅ **PASS**         |
| **TC-18** | UI Layout      | Anti-corruption badge cleanup                              | Expand grid area                                            | ✅ **PASS**         |
| **TC-19** | Row Selection  | Row selection on row number click                          | Select entire row and focus column 0                        | ✅ **PASS**         |
| **TC-20** | Rendering      | Selected row accent highlighting                           | Distinct blue background and white bold row number          | ✅ **PASS**         |
| **TC-21** | Help Modal     | Help modal 5-tab contents validation                       | Overview, Features, Guide, FAQ tabs render properly         | ✅ **PASS**         |
| **TC-22** | Selection      | Range selection (Shift+Drag / Shift+Arrows / Ctrl+A)       | Select bounding rectangular cell region                     | ✅ **PASS**         |
| **TC-23** | Clipboard      | Range TSV clipboard copy (`Ctrl + C`)                      | Clean TSV string copied to clipboard                        | ✅ **PASS**         |
| **TC-24** | Feedback       | Clipboard copy toast notification                          | Displays copied row/col count and auto-dismisses            | ✅ **PASS**         |
| **TC-25** | Search         | RegEx full-text search (`\d{3}-\d{4}`)                     | Instant pattern matching                                    | ✅ **PASS**         |
| **TC-26** | Error Safety   | Invalid RegEx syntax error handling                        | Safe warning banner without crashing                        | ✅ **PASS**         |
| **TC-27** | Structural Ops | Row insert, duplicate, delete from context menu            | Accurate row manipulation and row count updates             | ✅ **PASS**         |
| **TC-28** | Structural Ops | Column insert, duplicate, delete from context menu         | Accurate column manipulation and header updates             | ✅ **PASS**         |
| **TC-29** | History        | Bidirectional Undo (`Ctrl+Z`) and Redo (`Ctrl+Y`)          | Complete history restoration for edits & structural changes | ✅ **PASS**         |
| **TC-30** | Export         | High-speed chunked CSV file splitting                      | Export split chunks with preserved headers                  | ✅ **PASS**         |
| **TC-31** | View Mode      | Synchronous table ⇔ raw text mode toggle                   | Maintain dirty state across view modes                      | ✅ **PASS**         |
