---
name: mermaid-diagram
description: >-
  Use this skill when visualizing architecture, component structure, data flow, or state transitions
  using Mermaid diagrams in QuCSView documentation or design plans.
---

# Mermaid Diagram Authoring Guide

本スキルは、`QuCSView` における仕様書、設計書、実装計画書、ウォークスルー文書等でアーキテクチャや処理フローを視覚化する際のガイドラインです。

## 1. 作図方針

- **直感的な視覚化**: 複雑なモジュール連携や非同期通信（Tauri IPC、イベント等）は文章だけでなく図解を併用します。
- **記法統一**: Markdown 内で ````mermaid` コードブロックを使用します。

## 2. 主要ダイアグラム記法例

### アーキテクチャ / フロー図 (`flowchart TD / LR`)
```mermaid
flowchart TD
    UI[フロントエンド React] -->|IPC Invoke| Bridge[Tauri Bridge]
    Bridge -->|Rust Command| Core[Rust Core Engine]
    Core -->|Event Emit| UI
```

### 状態遷移図 (`stateDiagram-v2`)
```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Loading: ファイルオープン
    Loading --> Ready: パース完了
    Loading --> Error: エラー発生
    Error --> Idle: リセット
```

### シーケンス図 (`sequenceDiagram`)
```mermaid
sequenceDiagram
    autonumber
    actor Boss as ボス
    participant UI as フロントエンド
    participant Backend as Rustバックエンド

    Boss->>UI: アクション実行
    UI->>Backend: IPCリクエスト
    Backend-->>UI: レスポンス
    UI-->>Boss: 画面更新
```
