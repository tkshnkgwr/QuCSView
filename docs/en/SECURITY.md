# Security Policy

**English** | [日本語版](../../docs/ja/SECURITY.md)

---

## 1. Security Architecture & Scopes

QuCSVPreview is engineered to operate exclusively on local files explicitly selected by the user.

1. **Sandboxing & IPC Capabilities**:
   - Tauri v2 fine-grained permissions restrict filesystem access strictly to the targeted workspace/file without unrestricted system command execution.
2. **Offline-First Privacy**:
   - All parsing, cell manipulation, full-text searching, and encoding conversions are executed entirely on-device. No telemetry or tabular data is transmitted over the network.

---

## 2. Reporting a Vulnerability

If you discover a potential security vulnerability or data loss issue, please do not open a public issue. Instead, report it privately:

- **Security Email**: `security@qucsvpreview.example.com`
- **Include**:
  - Version affected (e.g. v0.1.0)
  - Proof of Concept (PoC) or reproduction steps
  - Estimated impact

We will acknowledge receipt within 48 hours and coordinate remediation before public disclosure.
