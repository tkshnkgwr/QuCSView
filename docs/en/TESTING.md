# Testing Strategy

**English** | [日本語版](../../docs/ja/TESTING.md)

---

## 1. Testing Pyramid & Verification Levels

```mermaid
graph TD
    classDef test fill:#1A1D23,stroke:#3B82F6,stroke-width:2px,color:#FFFFFF;
    Unit["1. Unit Tests (cargo test / Vitest)<br/>・Byte-offset mmap scanning<br/>・Encoding roundtrips (Shift_JIS / UTF-8)<br/>・Zero-mutation literal preservation"]:::test
    Integration["2. IPC Integration Tests<br/>・Viewport 30-row slicing<br/>・Sparse diff editing & save cycle<br/>・Physical row index binding"]:::test
    Load["3. Heavy Stress & Memory Profiling (500MB+)<br/>・RAM leakage check (RAM < 40MB)<br/>・60FPS scrolling smoothness"]:::test

    Unit --> Integration --> Load
```

---

## 2. Rust Unit Tests (`src-tauri`)

### Execution Command
```bash
cd src-tauri
cargo test -- --nocapture
```

### Core Test Cases
1. **`test_mmap_offset_indexing`**:
   - Accurate byte offset calculation across `CRLF`, `LF`, and mixed line breaks.
2. **`test_zero_type_mutation_preservation`**:
   - Verify that strings like `00123`, `090-0000-0000`, and `2026/08/20` remain strictly unmodified through parsing, cell editing, and file serialization.
3. **`test_encoding_roundtrip`**:
   - Verify zero mojibake when roundtripping Shift_JIS/CP932 Japanese characters.

---

## 3. Frontend & IPC Integration Tests

1. **Virtual Window Boundary Tests**:
   - Verify slicing behavior at index 0, total row count boundary, and random fast-scroll jumps.
2. **Physical Row Binding Tests**:
   - Verify that Filter Mode correctly renders 1-indexed source row numbers in the frozen `#` column.
