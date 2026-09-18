---
name: release-automation
description: >-
  Use this skill when the boss (user) explicitly instructs to release or publish a new version of QuCSView (e.g., 'リリースして', 'バージョンアップして').
  Guides automated version bump, multi-file synchronization, pre-release verification, and Git tag push.
---

# Release Automation Protocol

本スキルは、ボスから「リリースして」と明確にチャットで指示された際にのみ発火し、安全かつ正確にバージョン同期・検証・リリースを行うための手順書です。

## 1. 前提チェック

1. 作業ツリーがクリーンであること（未コミットの変更がないこと）。
2. メインブランチ（`main` 等）の最新状態であること。

## 2. リリース実行手順

```powershell
# 1. バージョン同期スクリプトの実行（patch, minor, major 等）
node scripts/release.js patch

# 2. 事前強制検証の実行
# （tauri-verification スキルの手順に従って Rust / TS の検証を完了）

# 3. バージョン更新ファイルのコミット
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "release: vX.Y.Z リリース"

# 4. タグの作成と Push
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

## 3. リリース後の確認

- GitHub Actions の Release ワークフローが起動したことを確認し、完了をボスへ報告します。
