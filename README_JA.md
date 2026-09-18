# QuCSView (超高速・超軽量 CSVプレビュー＆セル直接編集アプリ)

[![Tauri v2](https://img.shields.io/badge/Tauri-v2.0-24C8D5?logo=tauri&logoColor=white)](https://tauri.app/)
[![React 19](https://img.shields.io/badge/React-v19.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-1.75+-DEA584?logo=rust&logoColor=black)](https://www.rust-lang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11%20(x64)-0078D6?logo=windows&logoColor=white)](https://microsoft.com)

[English](README.md) | **日本語版** | [仕様書 (ja)](docs/ja/SPEC.md) | [Architecture (ja)](docs/ja/ARCHITECTURE.md)

**QuCSView** は、スペックの限られたWindows PC環境でも500MB級の巨大CSV/TSVファイルを1秒未満で瞬時に開き、セル単位の直接編集と保存を可能にする超軽量デスクトップアプリケーション（Tauri v2 + Rust + React 19 + TypeScript）です。

往年の名エディタ **「ViVi」** の快適な表プレビュー＆直接編集体験を現代のデスクトップに完全再現し、**Microsoft Excel特有の自動型変換によるデータ破壊（先頭0落ち、勝手な日付化、指数表記化）を根絶**します。

---

## 📄 ライセンス

本プロジェクトは MIT License のもとで公開されています - Copyright (c) 2026 tkshnkgwr。詳細は [LICENSE](LICENSE) をご覧ください。
