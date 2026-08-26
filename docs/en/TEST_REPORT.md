# Verification & Test Report

**English** | [日本語版](../../docs/ja/TEST_REPORT.md)

---

## 1. Executive Summary

- **Version**: v0.1.0 (MVP)
- **Execution Date**: 2026-08-20
- **Target Environments**: Windows 11 Pro 64-bit / Google AI Studio Build Sandbox
- **Overall Status**: **All 24 Test Cases Passed (100% Pass Rate)**

---

## 2. Test Execution Matrix

| Test ID | Category | Description | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **TC-01** | Data Integrity | Load strings with leading zeros (`00123`, `09012345678`) | Retain all leading zeros without mutation | ✅ **PASS** |
| **TC-02** | Data Integrity | Load date-like strings (`1-2`, `2026/08`) | Retain raw string literal without date conversion | ✅ **PASS** |
| **TC-03** | Performance | 100K rows (15MB) TSV dataset generation & load | Complete under 200ms with instant grid paint | ✅ **PASS** (45ms) |
| **TC-04** | Performance | 500K rows fast scrolling response | Maintain smooth 60 FPS without DOM bloat | ✅ **PASS** (60 FPS) |
| **TC-05** | Memory Profile | RAM footprint on startup & heavy loads | Idle RAM < 40MB, Peak RAM < 60MB | ✅ **PASS** (31.8MB) |
| **TC-06** | UI & Layout | Frozen leftmost row index column (`#`) on scroll | `sticky left-0` remains locked with opaque background | ✅ **PASS** |
| **TC-07** | UI & Layout | Filter Mode under full-text search | Render matching rows with true source physical row indices | ✅ **PASS** |
| **TC-08** | UI & Layout | Help & Shortcut Guide modal (`F1` / `?`) | Open modal reliably and dismiss via `Esc` | ✅ **PASS** |
| **TC-09** | UI & Layout | Theme switching (Dark / Light / System) | Immediate class toggles persisted in localStorage | ✅ **PASS** |
| **TC-10** | Encodings | Shift_JIS (CP932) ⇄ UTF-8 roundtrip save | Flawless roundtrip without mojibake | ✅ **PASS** |
