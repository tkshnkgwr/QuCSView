// UPDATE 2026-08-20: [機能追加] テーマ切替プルダウン (ライト/ダーク/システム) および ヘルプモーダル起動ボタン (? / F1) の追加
import React, { useState, useRef, useEffect } from 'react';
import { Pin, PinOff, FileSpreadsheet, Sparkles, HelpCircle, Sun, Moon, Laptop, History, ChevronDown, Trash2, Clock } from 'lucide-react';
import { FileMetadata, ThemeMode, RecentFile } from '../types/csv';

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

  return (
// UPDATE 2026-08-26: [ライト/ダーク両対応タイトルバー & 最近開いたファイル履歴メニュー]
// なぜ: 直近開いたファイルを1クリックで再読込可能にし、アプリの作業効率を向上させるため
    <header
      id="qu-titlebar"
      className="h-10 bg-[#F3F4F6] dark:bg-[#1A1D23] border-b border-gray-300 dark:border-[#2D3139] text-gray-800 dark:text-[#D1D5DB] flex items-center justify-between px-3 select-none text-xs font-mono tracking-tight shrink-0 shadow-xs"
    >
      {/* 左側: アプリロゴ、ファイルパス/ステータス、最近開いたファイルメニュー */}
      <div className="flex items-center gap-2.5 overflow-hidden">
        <div className="flex items-center gap-1.5 font-bold text-blue-600 dark:text-blue-400 bg-white dark:bg-[#0F1115] border border-gray-300 dark:border-[#374151] px-2 py-0.5 rounded text-[11px] tracking-wider uppercase shadow-2xs">
          <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>QuCSView</span>
        </div>

        {/* 最近開いたファイル（Recent Files）ドロップダウン */}
        {recentFiles.length > 0 && onOpenRecentFile && (
          <div className="relative" ref={recentMenuRef}>
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
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 dark:border-[#2D3139] text-gray-500 dark:text-gray-400 text-[10px] font-bold">
                  <span>最近開いたファイル</span>
                  {onClearRecentFiles && (
                    <button
                      type="button"
                      onClick={() => {
                        onClearRecentFiles();
                        setIsRecentMenuOpen(false);
                      }}
                      className="flex items-center gap-1 text-red-500 hover:text-red-600 hover:underline cursor-pointer"
                      title="履歴をすべて消去"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                      <span>クリア</span>
                    </button>
                  )}
                </div>

                <div className="max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-[#242A35]">
                  {recentFiles.map((file, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        onOpenRecentFile(file);
                        setIsRecentMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-[#20252E] flex flex-col gap-0.5 transition-colors cursor-pointer group"
                    >
                      <span className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate text-[11px]">
                        {file.name}
                      </span>
                      <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500">
                        <span>{(file.size / 1024).toFixed(1)} KB {file.encoding ? `• ${file.encoding}` : ''}</span>
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(file.lastOpened).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 truncate max-w-md">
          {metadata ? (
            <>
              <div className="flex items-center gap-1.5 bg-white dark:bg-[#0F1115] border border-gray-300 dark:border-[#2D3139] px-2 py-0.5 rounded text-xs text-gray-800 dark:text-gray-300">
                <span className="text-gray-400 font-mono text-[11px]">/data/</span>
                <span className="text-gray-900 dark:text-gray-100 font-semibold truncate">
                  {metadata.fileName}
                </span>
              </div>
              {metadata.isDirty && (
                <span className="text-amber-600 dark:text-amber-400 font-bold px-1.5 py-0.5 bg-amber-100 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-600/40 rounded text-[10px] animate-pulse" title="未保存の変更があります">
                  MODIFIED
                </span>
              )}
              <span className="text-gray-400 dark:text-gray-500">|</span>
              <span className="text-gray-600 dark:text-gray-400 text-[11px]">
                <span className="text-blue-600 dark:text-blue-400 font-semibold">{metadata.totalRows.toLocaleString()}</span> rows × <span className="text-blue-600 dark:text-blue-400 font-semibold">{metadata.totalCols}</span> cols
              </span>
            </>
          ) : (
            <span className="text-gray-500">ファイル未読込 - CSV/TSVをドロップまたは選択</span>
          )}
        </div>
      </div>

      {/* 右側: 検証データ、テーマ選択、ヘルプ、最前面トグル */}
      <div className="flex items-center gap-2">
        {/* ベンチマークプリセット */}
        <div className="hidden lg:flex items-center gap-1 bg-white dark:bg-[#0F1115] border border-gray-300 dark:border-[#2D3139] rounded px-1.5 py-0.5 shadow-2xs">
          <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium px-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-blue-500 dark:text-blue-400" />
            検証:
          </span>
          <button
            id="btn-bench-10k"
            onClick={() => onLoadBenchmark(10000, false)}
            className="px-1.5 py-0.5 rounded text-[10px] hover:bg-gray-200 dark:hover:bg-[#2D3139] text-gray-700 dark:text-gray-300 transition-colors cursor-pointer"
            title="1万行 CSV生成"
          >
            10K
          </button>
          <button
            id="btn-bench-50k"
            onClick={() => onLoadBenchmark(50000, false)}
            className="px-1.5 py-0.5 rounded text-[10px] hover:bg-gray-200 dark:hover:bg-[#2D3139] text-gray-700 dark:text-gray-300 transition-colors cursor-pointer"
            title="5万行 CSV生成"
          >
            50K
          </button>
          <button
            id="btn-bench-100k"
            onClick={() => onLoadBenchmark(100000, true)}
            className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700/40 hover:bg-blue-200 dark:hover:bg-blue-800/40 transition-colors font-bold cursor-pointer"
            title="10万行 TSV生成（大容量メモリマップテスト）"
          >
            100K (TSV)
          </button>
        </div>

        {/* テーマ切替ボタングループ */}
        <div
          id="group-theme-mode"
          className="flex items-center bg-white dark:bg-[#0F1115] border border-gray-300 dark:border-[#2D3139] rounded p-0.5 shadow-2xs"
          role="group"
          aria-label="テーマ表示モード切り替え"
        >
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
        >
          <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </button>

        {/* 📌 常時最前面切り替え (アイコンのみ) */}
        <button
          id="btn-toggle-always-on-top"
          onClick={onToggleAlwaysOnTop}
          className={`flex items-center justify-center p-1.5 rounded border transition-colors cursor-pointer shadow-2xs ${
            alwaysOnTop
              ? 'bg-blue-600 text-white border-blue-500 shadow-xs'
              : 'bg-white dark:bg-[#0F1115] text-gray-700 dark:text-gray-400 border-gray-300 dark:border-[#2D3139] hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#1A1D23]'
          }`}
          title={alwaysOnTop ? '最前面固定: ON' : '最前面固定: OFF'}
          aria-label={alwaysOnTop ? '最前面固定解除' : '最前面固定'}
        >
          {alwaysOnTop ? <Pin className="w-4 h-4 text-white" /> : <PinOff className="w-4 h-4 text-gray-500 dark:text-gray-400" />}
        </button>
      </div>
    </header>
  );
};

