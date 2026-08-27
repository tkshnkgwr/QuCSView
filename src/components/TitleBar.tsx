// UPDATE 2026-08-27: [カスタムタイトルバー ウィンドウ操作] 最小化・最大化・閉じるボタンの追加
import React, { useState, useRef, useEffect } from 'react';
import { Pin, PinOff, FileSpreadsheet, Sparkles, HelpCircle, Sun, Moon, Laptop, History, ChevronDown, Trash2, Clock, Minus, Square, X } from 'lucide-react';
import { FileMetadata, ThemeMode, RecentFile } from '../types/csv';
import { isTauriEnv } from '../services/tauriBridge';

interface TitleBarProps {
  metadata: FileMetadata | null;
  alwaysOnTop: boolean;
  onToggleAlwaysOnTop: () => void;
  onLoadBenchmark: (count: number, isTsv?: boolean) => void;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  onOpenHelp: () => void;
  recentFiles?: RecentFile[];
  onOpenRecentFile?: (file: RecentFile) => void;
  onClearRecentFiles?: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  metadata,
  alwaysOnTop,
  onToggleAlwaysOnTop,
  onLoadBenchmark,
  themeMode,
  onThemeChange,
  onOpenHelp,
  recentFiles = [],
  onOpenRecentFile,
  onClearRecentFiles,
}) => {
  const [isRecentMenuOpen, setIsRecentMenuOpen] = useState(false);
  const recentMenuRef = useRef<HTMLDivElement>(null);

  // 外側クリックでメニューを閉じる
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (recentMenuRef.current && !recentMenuRef.current.contains(e.target as Node)) {
        setIsRecentMenuOpen(false);
      }
    };
    if (isRecentMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isRecentMenuOpen]);

  // ウィンドウ最小化
  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTauriEnv()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('minimize_window');
      } catch (err) {
        console.warn('Failed to minimize window:', err);
      }
    }
  };

  // ウィンドウ最大化 / 復元
  const handleToggleMaximize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTauriEnv()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('toggle_maximize_window');
      } catch (err) {
        console.warn('Failed to toggle maximize window:', err);
      }
    }
  };

  // ウィンドウ終了（閉じる）
  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTauriEnv()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('close_window');
      } catch (err) {
        console.warn('Failed to close window:', err);
      }
    }
  };

  return (
// UPDATE 2026-08-26: [ライト/ダーク両対応タイトルバー & 最近開いたファイル履歴メニュー]
// なぜ: 直近開いたファイルを1クリックで再読込可能にし、アプリの作業効率を向上させるため
    <header
      id="qu-titlebar"
      data-tauri-drag-region
      onDoubleClick={handleToggleMaximize}
      className="h-10 bg-[#F3F4F6] dark:bg-[#1A1D23] border-b border-gray-300 dark:border-[#2D3139] text-gray-800 dark:text-[#D1D5DB] flex items-center justify-between pl-3 pr-0 select-none text-xs font-mono tracking-tight shrink-0 shadow-xs cursor-default"
    >
      {/* 左側: アプリロゴ、ファイルパス/ステータス、最近開いたファイルメニュー */}
      <div className="flex items-center gap-2.5 overflow-hidden" data-tauri-drag-region>
        <div className="flex items-center gap-1.5 font-bold text-blue-600 dark:text-blue-400 bg-white dark:bg-[#0F1115] border border-gray-300 dark:border-[#374151] px-2 py-0.5 rounded text-[11px] tracking-wider uppercase shadow-2xs">
          <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>QuCSView</span>
        </div>

        {/* 最近開いたファイル（Recent Files）ドロップダウン */}
        {recentFiles.length > 0 && onOpenRecentFile && (
          <div className="relative" ref={recentMenuRef} data-tauri-drag-region="false">
            <button
              id="btn-recent-files-menu"
              type="button"
              onClick={() => setIsRecentMenuOpen((prev) => !prev)}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-white dark:bg-[#0F1115] border border-gray-300 dark:border-[#2D3139] hover:border-gray-400 dark:hover:border-gray-500 text-gray-700 dark:text-gray-300 text-[10px] font-semibold transition-colors cursor-pointer shadow-2xs"
              title="最近開いたファイル履歴"
            >
              <History className="w-3 h-3 text-blue-600 dark:text-blue-400" />
              <span>履歴 ({recentFiles.length})</span>
              <ChevronDown className="w-2.5 h-2.5 text-gray-400" />
            </button>

            {isRecentMenuOpen && (
              <div
                id="menu-recent-files-dropdown"
                className="absolute left-0 top-full mt-1 w-72 bg-white dark:bg-[#16191E] border border-gray-300 dark:border-[#2D3139] rounded-lg shadow-xl py-1 z-50 animate-in fade-in duration-100 text-xs"
              >
                <div className="px-3 py-1.5 border-b border-gray-200 dark:border-[#2D3139] flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                  <span className="font-semibold">最近開いたファイル (最大10件)</span>
                  {onClearRecentFiles && (
                    <button
                      id="btn-clear-recent-files"
                      type="button"
                      onClick={() => {
                        onClearRecentFiles();
                        setIsRecentMenuOpen(false);
                      }}
                      className="hover:text-red-500 transition-colors flex items-center gap-1 cursor-pointer"
                      title="履歴をすべてクリア"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>クリア</span>
                    </button>
                  )}
                </div>
                <div className="max-h-60 overflow-y-auto py-1">
                  {recentFiles.map((file, idx) => (
                    <button
                      key={file.path || idx}
                      type="button"
                      onClick={() => {
                        onOpenRecentFile(file);
                        setIsRecentMenuOpen(false);
                      }}
                      className="w-full px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-[#242A35] flex items-center gap-2 transition-colors cursor-pointer group"
                    >
                      <Clock className="w-3 h-3 text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-800 dark:text-gray-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          {file.name}
                        </div>
                        {file.path && (
                          <div className="text-[10px] text-gray-400 truncate">
                            {file.path}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 truncate" data-tauri-drag-region>
          {metadata ? (
            <>
              <span
                id="titlebar-filename"
                data-tauri-drag-region
                className="font-bold text-gray-900 dark:text-white truncate max-w-[280px]"
                title={metadata.filePath || metadata.fileName}
              >
                {metadata.fileName}
              </span>
              {metadata.isDirty && (
                <span
                  id="badge-is-dirty"
                  data-tauri-drag-region
                  className="bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] px-1.5 py-0.2 rounded font-bold border border-amber-500/30"
                >
                  ● 変更あり
                </span>
              )}
            </>
          ) : (
            <span className="text-gray-400 dark:text-gray-500 italic" data-tauri-drag-region>ファイル未読込</span>
          )}
        </div>
      </div>

      {/* 🚀 中央: 広大なウィンドウドラッグ専用領域 */}
      <div className="flex-1 h-full min-w-[20px]" data-tauri-drag-region />

      {/* 右側: ツールボタン & ウィンドウ操作ボタン */}
      <div className="flex items-center gap-2 h-full">
        {/* 🚀 ベンチマーク・サンプルデータ即時ロード */}
        <div className="flex items-center gap-1" data-tauri-drag-region="false">
          <button
            id="btn-load-sample-10k"
            onClick={() => onLoadBenchmark(10000, false)}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-white dark:bg-[#0F1115] border border-gray-300 dark:border-[#2D3139] hover:border-gray-400 dark:hover:border-gray-500 text-gray-700 dark:text-gray-300 text-[10px] font-semibold transition-colors cursor-pointer shadow-2xs"
            title="10,000行のサンプルCSVデータを即時生成してテーブルを描画"
          >
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span>1万行</span>
          </button>
          <button
            id="btn-load-sample-100k"
            onClick={() => onLoadBenchmark(100000, false)}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-white dark:bg-[#0F1115] border border-gray-300 dark:border-[#2D3139] hover:border-gray-400 dark:hover:border-gray-500 text-gray-700 dark:text-gray-300 text-[10px] font-semibold transition-colors cursor-pointer shadow-2xs"
            title="100,000行の大規模サンプルCSVデータを即時生成して超高速描画を体感"
          >
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span>10万行</span>
          </button>
        </div>

        {/* 🎨 テーマ切替 (ダーク / ライト / システム) */}
        <div className="flex items-center bg-white dark:bg-[#0F1115] border border-gray-300 dark:border-[#2D3139] rounded p-0.5 shadow-2xs" data-tauri-drag-region="false">
          <button
            id="btn-theme-dark"
            type="button"
            onClick={() => onThemeChange('dark')}
            className={`p-1 rounded transition-colors cursor-pointer ${
              themeMode === 'dark'
                ? 'bg-[#242A35] text-blue-400 font-bold shadow-xs'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#1A1D23]'
            }`}
            title="ダークモード (Dark)"
            aria-label="ダークモード"
          >
            <Moon className="w-3.5 h-3.5" />
          </button>
          <button
            id="btn-theme-light"
            type="button"
            onClick={() => onThemeChange('light')}
            className={`p-1 rounded transition-colors cursor-pointer ${
              themeMode === 'light'
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-500 font-bold shadow-xs'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#1A1D23]'
            }`}
            title="ライトモード (Light)"
            aria-label="ライトモード"
          >
            <Sun className="w-3.5 h-3.5" />
          </button>
          <button
            id="btn-theme-system"
            type="button"
            onClick={() => onThemeChange('system')}
            className={`p-1 rounded transition-colors cursor-pointer ${
              themeMode === 'system'
                ? 'bg-blue-600/20 text-blue-700 dark:text-blue-300 font-bold shadow-xs'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#1A1D23]'
            }`}
            title="システム連動 (System)"
            aria-label="システム連動"
          >
            <Laptop className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ❓ ヘルプボタン (アイコンのみ) */}
        <button
          id="btn-open-help"
          onClick={onOpenHelp}
          className="flex items-center justify-center p-1.5 bg-white dark:bg-[#0F1115] border border-gray-300 dark:border-[#2D3139] hover:border-blue-600 dark:hover:border-blue-500 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors cursor-pointer shadow-2xs"
          title="ヘルプ＆ショートカット一覧 (F1)"
          aria-label="ヘルプ (F1)"
          data-tauri-drag-region="false"
        >
          <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </button>

        {/* 📌 常時最前面切り替え (アイコンのみ) */}
        <button
          id="btn-toggle-always-on-top"
          onClick={onToggleAlwaysOnTop}
          className={`flex items-center justify-center p-1.5 rounded border transition-colors cursor-pointer shadow-2xs mr-1 ${
            alwaysOnTop
              ? 'bg-blue-600 text-white border-blue-500 shadow-xs'
              : 'bg-white dark:bg-[#0F1115] text-gray-700 dark:text-gray-400 border-gray-300 dark:border-[#2D3139] hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#1A1D23]'
          }`}
          title={alwaysOnTop ? '最前面固定: ON' : '最前面固定: OFF'}
          aria-label={alwaysOnTop ? '最前面固定解除' : '最前面固定'}
          data-tauri-drag-region="false"
        >
          {alwaysOnTop ? <Pin className="w-4 h-4 text-white" /> : <PinOff className="w-4 h-4 text-gray-500 dark:text-gray-400" />}
        </button>

        {/* 🪟 ウィンドウコントロール（最小化 / 最大化 / 終了） */}
        <div className="flex items-center h-full border-l border-gray-300 dark:border-[#2D3139] ml-1" data-tauri-drag-region="false">
          <button
            id="btn-window-minimize"
            type="button"
            onClick={handleMinimize}
            className="h-10 w-11 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2D3139] transition-colors cursor-pointer"
            title="最小化"
            aria-label="最小化"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            id="btn-window-maximize"
            type="button"
            onClick={handleToggleMaximize}
            className="h-10 w-11 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2D3139] transition-colors cursor-pointer"
            title="最大化 / 復元"
            aria-label="最大化"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            id="btn-window-close"
            type="button"
            onClick={handleClose}
            className="h-10 w-12 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-white hover:bg-red-600 active:bg-red-700 transition-colors cursor-pointer"
            title="終了（閉じる）"
            aria-label="終了"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

