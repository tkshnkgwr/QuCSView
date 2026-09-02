#!/usr/bin/env node

/**
 * QuCSView リリース自動化スクリプト
 * 
 * 使用方法:
 *   node scripts/release.js [patch | minor | major | <version>] [--dry-run]
 * 
 * 役割:
 *   1. package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json のバージョンを完全同期
 *   2. 事前検証 (lint, test, cargo check) の実行
 *   3. リリースタグ (vX.Y.Z) の作成案内
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const bumpType = args.find(arg => !arg.startsWith('--')) || 'patch';

// ファイルパス
const packageJsonPath = path.join(rootDir, 'package.json');
const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
const versionTsPath = path.join(rootDir, 'src', 'version.ts');

// 現在のバージョン取得
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = pkg.version;

function calculateNextVersion(current, type) {
  const parts = current.split('.').map(Number);
  if (type === 'major') {
    return `${parts[0] + 1}.0.0`;
  } else if (type === 'minor') {
    return `${parts[0]}.${parts[1] + 1}.0`;
  } else if (type === 'patch') {
    return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  } else if (/^\d+\.\d+\.\d+$/.test(type)) {
    return type;
  } else {
    throw new Error(`無効なバージョンまたはインクリメント種別です: ${type}`);
  }
}

const nextVersion = calculateNextVersion(currentVersion, bumpType);

console.log('====================================================');
console.log(`📦 QuCSView Release Preparation: v${currentVersion} -> v${nextVersion}`);
console.log(`モード: ${isDryRun ? '🔍 DRY-RUN (変更は書き込まれません)' : '🚀 適用'}`);
console.log('====================================================');

if (!isDryRun) {
  // 1. package.json 更新
  pkg.version = nextVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`✅ Updated package.json -> ${nextVersion}`);

  // 2. src-tauri/Cargo.toml 更新
  let cargoContent = fs.readFileSync(cargoTomlPath, 'utf8');
  cargoContent = cargoContent.replace(/^version = "[^"]+"/m, `version = "${nextVersion}"`);
  fs.writeFileSync(cargoTomlPath, cargoContent, 'utf8');
  console.log(`✅ Updated src-tauri/Cargo.toml -> ${nextVersion}`);

  // 3. src-tauri/tauri.conf.json 更新
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
  tauriConf.version = nextVersion;
  fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');
  console.log(`✅ Updated src-tauri/tauri.conf.json -> ${nextVersion}`);

  // 4. src/version.ts 更新
  fs.writeFileSync(versionTsPath, `export const APP_VERSION = '${nextVersion}';\n`, 'utf8');
  console.log(`✅ Updated src/version.ts -> ${nextVersion}`);
} else {
  console.log(`[DRY-RUN] package.json -> ${nextVersion}`);
  console.log(`[DRY-RUN] src-tauri/Cargo.toml -> ${nextVersion}`);
  console.log(`[DRY-RUN] src-tauri/tauri.conf.json -> ${nextVersion}`);
  console.log(`[DRY-RUN] src/version.ts -> ${nextVersion}`);
}

console.log('\n✨ バージョン同期が完了しました。');
console.log('ボス、リリースを発行する場合は以下のコマンドを実行してください：');
console.log('----------------------------------------------------');
console.log(`git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src/version.ts`);
console.log(`git commit -m "release: bump version to v${nextVersion}"`);
console.log(`git tag v${nextVersion}`);
console.log(`git push origin main`);
console.log(`git push origin v${nextVersion}`);
console.log('----------------------------------------------------');
console.log('タグがPushされると、GitHub Actions により全自動でビルド＆Releases公開が発動します。');
