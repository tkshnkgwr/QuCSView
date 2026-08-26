// UPDATE 2026-08-20: [機能追加] テーマ切替プルダウン (ライト/ダーク/システム) および ヘルプモーダル起動ボタン (? / F1) の追加
import React from 'react';
import { Pin, PinOff, FileSpreadsheet, Sparkles, HelpCircle, Sun, Moon, Laptop } from 'lucide-react';
import { FileMetadata, ThemeMode } from '../types/csv';

interface TitleBarProps {
  metadata: FileMetadata | null;
  alwaysOnTop: boolean;
  onToggleAlwaysOnTop: () => void;
  onLoadBenchmark: (count: number, isTsv?: boolean) => void;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  onOpenHelp: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  metadata,
  alwaysOnTop,
  onToggleAlwaysOnTop,
  onLoadBenchmark,
  themeMode,
  onThemeChange,
  onOpenHelp,
}) => {
  return (
// UPDATE 2026-08-26: [ライト/ダーク両対応タイトルバー]
// なぜ: 無効な light: 構文を除去し、ライトモード（デフォルト）と dark: バリアントによる高視認性スタイルを完全適用するため
    <header
      id="qu-titlebar"
      className="h-10 bg-[#F3F4F6] dark:bg-[#1A1D23] border-b border-gray-300 dark:border-[#2D3139] text-gray-800 dark:text-[#D1D5DB] flex items-center justify-between px-3 select-none text-xs font-mono tracking-tight shrink-0 shadow-xs"
    >
      {/* 左側: アプリロゴとファイルパス/ステータス */}
      <div className="flex items-center gap-2.5 overflow-hidden">
        <div className="flex items-center gap-1.5 font-bold text-blue-600 dark:text-blue-400 bg-white dark:bg-[#0F1115] border border-gray-300 dark:border-[#374151] px-2 py-0.5 rounded text-[11px] tracking-wider uppercase shadow-2xs">
          <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>QuCSView</span>
        </div>

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

