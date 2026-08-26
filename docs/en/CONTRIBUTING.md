# Contributing Guide

**English** | [日本語版](../../docs/ja/CONTRIBUTING.md)

---

## 1. Welcome

Thank you for contributing to QuCSVPreview. This project focuses on high performance on resource-constrained hardware and 100% preservation of literal CSV data against Excel-style type corruption.

---

## 2. Contribution Workflow

1. **Check or Open an Issue**:
   - For major architectural proposals or new features, open an issue first to align with the core roadmap.
2. **Fork & Create a Branch**:
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. **Adhere to Architectural Mandates**:
   - Review `docs/en/INSTRUCTIONS.md` (never stream bulk data into React, never cast CSV cells into numbers/dates).
4. **Conventional Commits**:
   - Use standard prefixes: `feat:`, `fix:`, `perf:`, `docs:`, `test:`.
5. **Submit a Pull Request (PR)**:
   - Provide a clear explanation of changes, rationale ("Why"), and benchmark results.
