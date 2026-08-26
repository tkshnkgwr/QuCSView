// UPDATE 2026-08-26: [最近開いたファイル履歴ユーティリティ]
// なぜ: 直近開いたファイルのパス・サイズ・日時をlocalStorageに保存し、タイトルバーから1クリックで再読込できるようにするため。

import { RecentFile } from '../types/csv';

const STORAGE_KEY = 'qucsview_recent_files_v1';
const MAX_RECENT_FILES = 10;

/**
 * 最近開いたファイルの一覧を取得（降順）
 */
export function getRecentFiles(): RecentFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: RecentFile[] = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.sort((a, b) => b.lastOpened - a.lastOpened);
    }
    return [];
  } catch (err) {
    console.warn('Failed to load recent files from localStorage:', err);
    return [];
  }
}

/**
 * 最近開いたファイル履歴に追加・更新
 */
export function addRecentFile(file: Omit<RecentFile, 'lastOpened'>): RecentFile[] {
  try {
    const current = getRecentFiles();
    const key = file.path || file.name;

    // 既存のエントリを削除（再追加して先頭にするため）
    const filtered = current.filter((item) => (item.path || item.name) !== key);

    const newEntry: RecentFile = {
      ...file,
      lastOpened: Date.now(),
    };

    const updated = [newEntry, ...filtered].slice(0, MAX_RECENT_FILES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn('Failed to save recent file to localStorage:', err);
    return getRecentFiles();
  }
}

/**
 * 指定したファイル履歴を削除
 */
export function removeRecentFile(pathOrName: string): RecentFile[] {
  try {
    const current = getRecentFiles();
    const updated = current.filter((item) => (item.path || item.name) !== pathOrName);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn('Failed to remove recent file from localStorage:', err);
    return getRecentFiles();
  }
}

/**
 * 全てのファイル履歴をクリア
 */
export function clearRecentFiles(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('Failed to clear recent files from localStorage:', err);
  }
}
