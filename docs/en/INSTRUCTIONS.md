# Developer & AI Instructions

**English** | [日本語版](../../docs/ja/INSTRUCTIONS.md)

---

## 1. Core Architectural Mandates

All contributors and AI coding agents must strictly adhere to the following directives:

### 🚨 Strictly Forbidden Patterns
1. **Never Send Bulk Arrays to React**:
   - IPC endpoints must never return full datasets across the bridge. Always enforce 30–50 row on-demand window slicing.
2. **Never Perform Type Inference on CSV Cells**:
   - Never parse cell contents into numeric types (`f64`, `parseInt`) or date objects. All cell contents must remain 100% literal strings.
3. **Preserve Low-Resource Profiles**:
   - Maintain idle CPU `< 0.1%` and idle RAM `< 40MB`. Status bar heartbeat updates must remain throttled to 1 tick per second.
4. **Preserve Sticky Layout & Theme Tokens**:
   - The frozen row index column (`sticky left-0`, opaque backgrounds `#16191E` / `#F3F4F6`) must never be modified or broken.

---

## 2. Source Modification Comment Rule

Whenever modifying existing source code, enclose changes with a structured comment explaining the **"Why"**:

```typescript
// UPDATE [YYYY-MM-DD]: [Topic] Clear technical justification of why this change was made
```

---

## 3. Commit Message Conventions (Conventional Commits)

- `feat:` New user-facing feature
- `fix:` Bug fix
- `perf:` Performance optimization (memory, startup, latency)
- `docs:` Documentation updates
- `refactor:` Code refactoring without behavioral changes
- `test:` Unit or integration test additions
