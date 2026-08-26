// UPDATE 2026-08-26: [Undo/Redo & 大規模ファイル高速分割 & CSVプレビュー ⇔ テキスト表示 切替ボタン]
// なぜ: 操作の取り消し・やり直し、行数指定による大容量CSV分割、表/テキスト表示切替をツールバーから素早く実行できるようにするため。
import React, { useRef } from 'react';
import {
  FolderOpen,
  Save,
  Search,
  ChevronUp,
  ChevronDown,
  ArrowRight,
  Filter,
  X,
  Table,
  FileText,
  Undo2,
  Redo2,
  Scissors,
  Replace,
} from 'lucide-react';
import {
  FileMetadata,
  SupportedEncoding,
  SupportedLineEnding,
  SupportedDelimiter,
  SearchState,
  ViewMode,
} from '../types/csv';

interface ToolbarProps {
  metadata: FileMetadata | null;
  hasHeader: boolean;
  onToggleHasHeader: (val: boolean) => void;
  onOpenFile: (file: File) => void;
  onSaveFile: () => void;
  onDelimiterChange?: (delimiter: SupportedDelimiter) => void;
  onEncodingChange?: (encoding: SupportedEncoding) => void;
  onLineEndingChange?: (lineEnding: SupportedLineEnding) => void;
  viewMode: ViewMode;
  onToggleViewMode: (mode: ViewMode) => void;
  modifiedCount?: number;
  searchState: SearchState;
  onSearchChange: (query: string) => void;
  onToggleCaseSensitive: () => void;
  onToggleRegex: () => void;
  onToggleFilterMode: () => void;
  onColumnFilterChange: (colIndex: number | null) => void;
  onNextMatch: () => void;
  onPrevMatch: () => void;
  onJumpToRow: (rowNumber: number) => void;
  jumpInput: string;
  setJumpInput: (val: string) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onOpenSplitModal?: () => void;
  onOpenFindReplace?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  metadata,
  hasHeader,
  onToggleHasHeader,
  onOpenFile,
  onSaveFile,
  onEncodingChange,
  viewMode,
  onToggleViewMode,
  modifiedCount = 0,
  searchState,
  onSearchChange,
  onToggleCaseSensitive,
  onToggleRegex,
  onToggleFilterMode,
  onColumnFilterChange,
  onNextMatch,
  onPrevMatch,
  onJumpToRow,
  jumpInput,
  setJumpInput,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onOpenSplitModal,
  onOpenFindReplace,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onOpenFile(e.target.files[0]);
    }
  };

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rowNum = parseInt(jumpInput, 10);
    if (!isNaN(rowNum) && rowNum >= 1) {
      onJumpToRow(rowNum - 1); // 1-indexed to 0-indexed
    }
  };

  // UPDATE 2026-08-20: [検索クリア] 検索キーワードをクリアし入力欄へフォーカス
  const handleClearSearch = () => {
    onSearchChange('');
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  return (
// UPDATE 2026-08-26: [ライト/ダーク両対応ツールバー]
// なぜ: 無効な light: 構文を除去し、ライトモード（デフォルト）と dark: バリアントによるスタイリングを完全適用するため
    <div
      id="qu-toolbar"
      className="bg-[#F9FAFB] dark:bg-[#1A1D23] border-b border-gray-300 dark:border-[#2D3139] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-gray-700 dark:text-gray-300 shrink-0 shadow-xs"
    >
      {/* 隠しファイルインプット */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv,.tsv,.txt,.dat"
        className="hidden"
      />

      {/* 左セクション: ファイル操作（開く・保存・ビュー切替・ヘッダ切替） */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          id="btn-open-file"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded border border-blue-500 font-medium transition-colors shadow-xs active:scale-95 cursor-pointer"
          title="CSV/TSVファイルを開く (Ctrl+O)"
        >
          <FolderOpen className="w-3.5 h-3.5 text-white" />
          <span>開く</span>
        </button>

        <button
          id="btn-save-file"
          onClick={onSaveFile}
          disabled={!metadata}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded border transition-colors font-medium active:scale-95 cursor-pointer shadow-xs ${
            modifiedCount > 0
              ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-900 dark:text-amber-300 border-amber-400 dark:border-amber-600/50 hover:bg-amber-200 dark:hover:bg-amber-900/60 font-bold'
              : 'bg-white dark:bg-[#242A35] hover:bg-gray-100 dark:hover:bg-[#2F3644] disabled:opacity-40 disabled:pointer-events-none text-gray-800 dark:text-gray-200 border-gray-300 dark:border-[#374151]'
          }`}
          title="ファイル保存設定ダイアログを開く (Ctrl+S)"
        >
          <Save className={`w-3.5 h-3.5 ${modifiedCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`} />
          <span>保存{modifiedCount > 0 ? ` (${modifiedCount}*)` : ''}</span>
        </button>

        {/* Undo / Redo ボタン */}
        <div className="flex items-center gap-0.5 bg-white dark:bg-[#0F1115] border border-gray-300 dark:border-[#2D3139] rounded p-0.5 shadow-2xs">
          <button
            id="btn-toolbar-undo"
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#242A35] disabled:opacity-30 disabled:pointer-events-none rounded transition-colors cursor-pointer"
            title="元に戻す (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            id="btn-toolbar-redo"
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#242A35] disabled:opacity-30 disabled:pointer-events-none rounded transition-colors cursor-pointer"
            title="やり直す (Ctrl+Y / Ctrl+Shift+Z)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 検索・置換ボタン */}
        {onOpenFindReplace && (
          <button
            id="btn-open-find-replace"
            type="button"
            onClick={onOpenFindReplace}
            disabled={!metadata}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded border bg-white dark:bg-[#242A35] hover:bg-gray-100 dark:hover:bg-[#2F3644] disabled:opacity-40 disabled:pointer-events-none text-gray-800 dark:text-gray-200 border-gray-300 dark:border-[#374151] transition-colors font-medium active:scale-95 cursor-pointer shadow-2xs"
            title="検索と置換ダイアログを開く (Ctrl+H)"
          >
            <Replace className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>置換</span>
          </button>
        )}

        {/* ファイル分割ボタン */}
        {onOpenSplitModal && (
          <button
            id="btn-open-split-modal"
            type="button"
            onClick={onOpenSplitModal}
            disabled={!metadata}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded border bg-white dark:bg-[#242A35] hover:bg-gray-100 dark:hover:bg-[#2F3644] disabled:opacity-40 disabled:pointer-events-none text-gray-800 dark:text-gray-200 border-gray-300 dark:border-[#374151] transition-colors font-medium active:scale-95 cursor-pointer shadow-2xs"
            title="行数を指定してファイルを高速分割 (Split CSV)"
          >
            <Scissors className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span>分割</span>
          </button>
        )}

        <div className="h-4 w-[1px] bg-gray-300 dark:bg-[#2D3139] mx-0.5" />

        {/* 表示モード切替ボタングループ: 表プレビュー ⇔ テキスト表示 */}
        <div
          id="view-mode-toggle-group"
          className="flex items-center bg-white dark:bg-[#0F1115] border border-gray-300 dark:border-[#2D3139] rounded p-0.5 shadow-2xs"
          title="表示モード切り替え (CSV表プレビュー ⇔ 生テキスト表示)"
        >
          <button
            id="btn-view-mode-table"
            type="button"
            onClick={() => onToggleViewMode('table')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
              viewMode === 'table'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
            title="CSV表プレビュー表示 (セル直接編集・高速仮想スクロール)"
          >
            <Table className="w-3.5 h-3.5" />
            <span>表表示</span>
          </button>
          <button
            id="btn-view-mode-text"
            type="button"
            onClick={() => onToggleViewMode('text')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
              viewMode === 'text'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
            title="テキスト表示 (生CSV/TSVテキスト表示・編集)"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>テキスト表示</span>
          </button>
        </div>

        <div className="h-4 w-[1px] bg-gray-300 dark:bg-[#2D3139] mx-0.5" />

        {/* 文字コード選択 & 表示 */}
        {metadata && onEncodingChange && (
          <div
            id="encoding-selector-container"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white dark:bg-[#0F1115] border border-gray-300 dark:border-[#2D3139] shadow-2xs"
            title="文字コード (クリックで手動再デコード切り替え)"
          >
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">文字コード:</span>
            <select
              id="select-active-encoding"
              value={metadata.encoding}
              onChange={(e) => onEncodingChange(e.target.value as SupportedEncoding)}
              className="bg-transparent text-gray-900 dark:text-gray-200 text-[11px] font-semibold focus:outline-none cursor-pointer"
            >
              <option value="UTF-8" className="bg-white dark:bg-[#1A1D23] text-gray-900 dark:text-gray-200">UTF-8</option>
              <option value="UTF-8 BOM" className="bg-white dark:bg-[#1A1D23] text-gray-900 dark:text-gray-200">UTF-8 BOM</option>
              <option value="Shift_JIS" className="bg-white dark:bg-[#1A1D23] text-gray-900 dark:text-gray-200">Shift_JIS (CP932)</option>
              <option value="EUC-JP" className="bg-white dark:bg-[#1A1D23] text-gray-900 dark:text-gray-200">EUC-JP</option>
            </select>
          </div>
        )}

        {/* [一行目をヘッダとする] チェックボックス */}
        <label
          id="label-has-header"
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-white dark:bg-[#0F1115] border border-gray-300 dark:border-[#2D3139] text-gray-800 dark:text-gray-200 cursor-pointer select-none shadow-2xs hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
          title="チェック時: 1行目を列名として使用 / 未チェック時: ヘッダー列を連番数字(1, 2...)とし1行目をデータ行として表示"
          aria-label="一行目をヘッダとする"
        >
          <input
            id="checkbox-has-header"
            type="checkbox"
            checked={hasHeader}
            onChange={(e) => onToggleHasHeader(e.target.checked)}
            className="rounded bg-white dark:bg-[#1A1D23] border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer accent-blue-600"
          />
          <span className="text-[11px] font-medium whitespace-nowrap">一行目をヘッダとする</span>
        </label>
      </div>

      {/* 右セクション: 高速文字列検索 & 行ジャンプ */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* 検索件数バッジ */}
        {searchState.query && (
          <div
            id="search-match-badge"
            className="flex items-center gap-1 bg-white dark:bg-[#0F1115] border border-gray-300 dark:border-[#374151] rounded px-2 py-0.5 shadow-2xs shrink-0 animate-in fade-in duration-150"
          >
            <span className="text-[11px] text-blue-600 dark:text-blue-400 font-bold whitespace-nowrap">
              {searchState.matches.length > 0
                ? `${searchState.currentIndex + 1}/${searchState.matches.length}件`
                : '0件'}
            </span>
            <button
              id="btn-search-prev"
              onClick={onPrevMatch}
              disabled={searchState.matches.length === 0}
              className="p-0.5 hover:bg-gray-200 dark:hover:bg-[#2D3139] text-gray-700 dark:text-gray-300 disabled:opacity-30 rounded cursor-pointer transition-colors"
              title="前のマッチ (Shift+Enter)"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              id="btn-search-next"
              onClick={onNextMatch}
              disabled={searchState.matches.length === 0}
              className="p-0.5 hover:bg-gray-200 dark:hover:bg-[#2D3139] text-gray-700 dark:text-gray-300 disabled:opacity-30 rounded cursor-pointer transition-colors"
              title="次のマッチ (Enter)"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 検索入力枠 */}
        <div
          className={`flex items-center bg-white dark:bg-[#0F1115] border rounded px-2 py-0.5 transition-colors shadow-2xs ${
            searchState.regexError
              ? 'border-red-500 focus-within:border-red-500'
              : 'border-gray-300 dark:border-[#374151] focus-within:border-blue-500'
          }`}
          title={searchState.regexError ? searchState.regexError : undefined}
        >
          <Search className="w-3.5 h-3.5 text-gray-400 mr-1.5 shrink-0" />
          <input
            id="input-search-csv"
            ref={searchInputRef}
            type="text"
            placeholder={searchState.useRegex ? '正規表現検索... (.*)' : '全文検索... (Ctrl+F)'}
            value={searchState.query}
            onChange={(e) => onSearchChange(e.target.value)}
            className="bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none w-48 shrink-0 text-xs font-mono"
          />

          {/* 検索クリアボタン */}
          {searchState.query && (
            <button
              id="btn-clear-search"
              type="button"
              onClick={handleClearSearch}
              className="p-0.5 mr-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800/50 rounded transition-colors cursor-pointer shrink-0"
              title="検索キーワードをクリア"
              aria-label="検索キーワードをクリア"
            >
              <X className="w-3 h-3" />
            </button>
          )}

          {/* 大文字小文字トグル */}
          <button
            id="btn-toggle-case"
            onClick={onToggleCaseSensitive}
            className={`px-1 py-0.2 rounded text-[10px] font-bold border mr-1 transition-colors cursor-pointer shrink-0 ${
              searchState.caseSensitive
                ? 'bg-blue-600 text-white border-blue-500'
                : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-200'
            }`}
            title="大文字・小文字を区別 (Aa)"
          >
            Aa
          </button>

          {/* 正規表現検索トグル */}
          <button
            id="btn-toggle-regex"
            onClick={onToggleRegex}
            className={`px-1.5 py-0.2 rounded text-[10px] font-bold font-mono border mr-1 transition-colors cursor-pointer shrink-0 ${
              searchState.useRegex
                ? 'bg-purple-600 text-white border-purple-500 font-bold'
                : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-200'
            }`}
            title={searchState.useRegex ? '正規表現検索: ON (.*)' : '正規表現検索 (RegEx) を有効化 (.*)'}
          >
            .*
          </button>

          {/* 検索行フィルタモード トグル */}
          <button
            id="btn-toggle-filter-mode"
            onClick={onToggleFilterMode}
            disabled={!searchState.query}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium border mr-1 flex items-center gap-0.5 transition-colors cursor-pointer shrink-0 ${
              searchState.filterMode
                ? 'bg-amber-600 text-white border-amber-500 font-bold'
                : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-200 disabled:opacity-30 disabled:pointer-events-none'
            }`}
            title={searchState.filterMode ? '行フィルタ中（一致行のみ表示・物理行番号維持）: ON' : '一致行のみに絞り込み表示 (Filter Mode)'}
          >
            <Filter className="w-3 h-3" />
            <span className="hidden sm:inline">絞込</span>
          </button>

          {/* 列フィルタ */}
          {metadata && metadata.headers.length > 0 && (
            <select
              id="select-search-col"
              value={searchState.columnFilter !== null ? searchState.columnFilter : ''}
              onChange={(e) =>
                onColumnFilterChange(e.target.value === '' ? null : parseInt(e.target.value, 10))
              }
              className="bg-gray-100 dark:bg-[#1A1D23] text-gray-800 dark:text-gray-300 text-[10px] rounded px-1 py-0.5 border border-gray-300 dark:border-[#2D3139] mr-0.5 focus:outline-none max-w-[76px] truncate cursor-pointer shrink-0"
              title="特定列のみ検索"
            >
              <option value="">全列</option>
              {metadata.headers.map((h, idx) => (
                <option key={idx} value={idx}>
                  {h}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 行ジャンプ */}
        <form onSubmit={handleJumpSubmit} className="flex items-center gap-1">
          <input
            id="input-jump-row"
            type="number"
            min="1"
            max={metadata?.totalRows || 999999}
            placeholder="行番号"
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            className="bg-white dark:bg-[#0F1115] border border-gray-300 dark:border-[#374151] rounded px-2 py-0.5 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 w-16 text-xs text-right font-mono shadow-2xs"
            title="指定の物理行へジャンプ"
          />
          <button
            type="submit"
            id="btn-jump-row"
            className="bg-white dark:bg-[#242A35] hover:bg-gray-100 dark:hover:bg-[#2F3644] text-gray-700 dark:text-gray-300 p-1 rounded border border-gray-300 dark:border-[#374151] transition-colors cursor-pointer shadow-2xs"
            title="指定行へジャンプ"
          >
            <ArrowRight className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          </button>
        </form>
      </div>
    </div>
  );
};

