import React, { useState, useEffect, useCallback } from 'react';
import { TitleBar } from './components/TitleBar';
import { Toolbar } from './components/Toolbar';
import { VirtualTable } from './components/VirtualTable';
import { RawTextView } from './components/RawTextView';
import { StatusBar } from './components/StatusBar';
import { HelpModal } from './components/HelpModal';
import { SaveModal } from './components/SaveModal';
import { SplitModal } from './components/SplitModal';
import { FindReplaceModal } from './components/FindReplaceModal';
import { FolderOpen, FileSpreadsheet } from 'lucide-react';
import {
  FileMetadata,
  CellCoordinate,
  SearchState,
  SortConfig,
  ViewMode,
  RecentFile,
  SelectionStats,
} from './types/csv';
import { isTauriEnv } from './services/tauriBridge';
import { useTheme } from './hooks/useTheme';
import { getRecentFiles } from './utils/recentFiles';
import { useHistoryManager } from './hooks/useHistoryManager';
import { useTableOperations } from './hooks/useTableOperations';
import { useFileOperations } from './hooks/useFileOperations';
import { useSearchOperations } from './hooks/useSearchOperations';

export default function App() {
  const { themeMode, setThemeMode, resolvedTheme } = useTheme();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false);

  const [metadata, setMetadata] = useState<FileMetadata | null>(null);
  const [hasHeader, setHasHeader] = useState<boolean>(true);
  const [activeCell, setActiveCell] = useState<CellCoordinate | null>({ row: 0, col: 0 });
  const [activeCellValue, setActiveCellValue] = useState<string>('');
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [jumpInput, setJumpInput] = useState('');
  const [jumpToRowTrigger, setJumpToRowTrigger] = useState<number | null>(null);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [selectionStats, setSelectionStats] = useState<SelectionStats | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [rawText, setRawText] = useState<string>('');
  const [modifiedCells, setModifiedCells] = useState<Set<string>>(new Set());

  const [searchState, setSearchState] = useState<SearchState>({
    query: '',
    caseSensitive: false,
    useRegex: false,
    regexError: null,
    columnFilter: null,
    matches: [],
    currentIndex: 0,
    isSearching: false,
    filterMode: false,
  });

  const [sortConfig, setSortConfig] = useState<SortConfig>({
    column: null,
    direction: null,
  });

  // アプリ起動時の履歴読込
  useEffect(() => {
    setRecentFiles(getRecentFiles());
  }, []);

  // 1. Undo/Redo 履歴管理カスタムフック
  const {
    undoStack,
    redoStack,
    pushAction,
    clearHistory,
    handleUndo,
    handleRedo,
  } = useHistoryManager({
    setMetadata,
    setActiveCell,
    setActiveCellValue,
    setJumpToRowTrigger,
    setModifiedCells,
    activeCell,
  });

  // 2. 検索・置換操作カスタムフック
  const {
    matchedRowIndices,
    executeSearch,
    handleSearchChange,
    handleToggleCaseSensitive,
    handleToggleRegex,
    handleToggleFilterMode,
    handleColumnFilterChange,
    handleNextMatch,
    handlePrevMatch,
    handleFindNextInModal,
    handleFindPrevInModal,
    handleReplaceCurrentInModal,
    handleReplaceAllInModal,
  } = useSearchOperations({
    searchState,
    setSearchState,
    activeCell,
    setActiveCell,
    setActiveCellValue,
    setJumpToRowTrigger,
    setModifiedCells,
    setMetadata,
    pushAction,
  });

  // 3. テーブル構造編集（セル編集・行/列挿入・削除・複製・ソート）カスタムフック
  const {
    handleCellEdited,
    handleBatchCellEdited,
    handleInsertRow,
    handleDeleteRow,
    handleDuplicateRow,
    handleInsertCol,
    handleDeleteCol,
    handleDuplicateCol,
    handleSortColumn,
  } = useTableOperations({
    metadata,
    setMetadata,
    activeCell,
    setActiveCell,
    setActiveCellValue,
    setModifiedCells,
    setJumpToRowTrigger,
    pushAction,
    setSortConfig,
  });

  // 4. ファイルオープン・保存・形式変更カスタムフック
  const {
    handleOpenFile,
    handleOpenFilePath,
    handleTriggerOpenFile,
    handleOpenRecentFile,
    handleClearRecentFiles,
    handleToggleViewMode,
    handleRawTextChange,
    handleToggleHasHeader,
    handleSaveFile,
    handleSaveConfirm,
    handleDelimiterChange,
    handleEncodingChange,
    handleLineEndingChange,
  } = useFileOperations({
    metadata,
    setMetadata,
    setHasHeader,
    setActiveCell,
    setActiveCellValue,
    setModifiedCells,
    setSearchState,
    setJumpToRowTrigger,
    setRawText,
    setRecentFiles,
    setIsSaveModalOpen,
    setViewMode,
    clearHistory,
    executeSearch,
    searchState,
  });

  // 行ジャンプ
  const handleJumpToRow = useCallback(
    (rowNumber: number) => {
      if (!metadata) return;
      const bounded = Math.max(0, Math.min(rowNumber, metadata.totalRows - 1));
      setActiveCell((prev) => ({ row: bounded, col: prev?.col || 0 }));
      setJumpToRowTrigger(bounded);
    },
    [metadata]
  );

  // アクティブセル同期
  const handleActiveCellChange = useCallback((coord: CellCoordinate | null, value: string) => {
    setActiveCell(coord);
    setActiveCellValue(value);
  }, []);

  // グローバルドラッグ＆ドロップおよびキーボードショートカット (F1, Ctrl+S, Ctrl+O, Ctrl+F 等)
  useEffect(() => {
    let dragCounter = 0;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
      if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
        setIsDragging(true);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        setIsDragging(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      setIsDragging(false);
      if (isTauriEnv()) {
        return;
      }
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleOpenFile(e.dataTransfer.files[0]);
      }
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setIsHelpOpen((prev) => !prev);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveFile();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handleTriggerOpenFile();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const searchInput = document.getElementById('input-search-csv') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setIsFindReplaceOpen(true);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);
    window.addEventListener('keydown', handleGlobalKeyDown);

    let unlistenTauriDrop: (() => void) | null = null;
    if (isTauriEnv()) {
      import('@tauri-apps/api/webview')
        .then(({ getCurrentWebview }) => {
          return getCurrentWebview().onDragDropEvent((event) => {
            if (event.payload.type === 'enter' || event.payload.type === 'over') {
              setIsDragging(true);
            } else if (event.payload.type === 'drop') {
              setIsDragging(false);
              const paths = event.payload.paths;
              if (paths && paths.length > 0 && paths[0]) {
                handleOpenFilePath(paths[0]);
              }
            } else if (event.payload.type === 'leave') {
              setIsDragging(false);
            }
          });
        })
        .then((unlisten) => {
          unlistenTauriDrop = unlisten;
        })
        .catch((err) => {
          console.warn('Failed to listen to Tauri dragDropEvent:', err);
        });
    }

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('keydown', handleGlobalKeyDown);
      if (unlistenTauriDrop) {
        unlistenTauriDrop();
      }
    };
  }, [handleOpenFile, handleOpenFilePath, handleSaveFile, handleTriggerOpenFile]);

  const currentMatch =
    searchState.matches.length > 0 ? searchState.matches[searchState.currentIndex] : null;

  return (
    <div
      id="qu-app-root"
      className="flex flex-col h-screen w-screen overflow-hidden bg-[#FAFAFA] dark:bg-[#0F1115] text-gray-800 dark:text-[#D1D5DB] font-mono select-none"
    >
      {/* 1. タイトルバー (テーマ切替 & ヘルプボタン & 最近開いたファイル履歴) */}
      <TitleBar
        metadata={metadata}
        alwaysOnTop={alwaysOnTop}
        onToggleAlwaysOnTop={() => setAlwaysOnTop(!alwaysOnTop)}
        themeMode={themeMode}
        onThemeChange={setThemeMode}
        onOpenHelp={() => setIsHelpOpen(true)}
        recentFiles={recentFiles}
        onOpenRecentFile={handleOpenRecentFile}
        onClearRecentFiles={handleClearRecentFiles}
      />

      {/* 2. ツールバー */}
      <Toolbar
        metadata={metadata}
        hasHeader={hasHeader}
        onToggleHasHeader={handleToggleHasHeader}
        onOpenFile={handleOpenFile}
        onTriggerOpenFile={handleTriggerOpenFile}
        onSaveFile={handleSaveFile}
        onEncodingChange={handleEncodingChange}
        viewMode={viewMode}
        onToggleViewMode={handleToggleViewMode}
        modifiedCount={modifiedCells.size}
        searchState={searchState}
        onSearchChange={handleSearchChange}
        onToggleCaseSensitive={handleToggleCaseSensitive}
        onToggleRegex={handleToggleRegex}
        onToggleFilterMode={handleToggleFilterMode}
        onColumnFilterChange={handleColumnFilterChange}
        onNextMatch={handleNextMatch}
        onPrevMatch={handlePrevMatch}
        onJumpToRow={handleJumpToRow}
        jumpInput={jumpInput}
        setJumpInput={setJumpInput}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenSplitModal={() => setIsSplitModalOpen(true)}
        onOpenFindReplace={() => setIsFindReplaceOpen(true)}
      />

      {/* 3. メインビュー（CSV表プレビュー ⇔ テキスト表示 の切替） */}
      {metadata ? (
        viewMode === 'text' ? (
          <RawTextView
            rawText={rawText}
            metadata={metadata}
            searchQuery={searchState.query}
            searchCaseSensitive={searchState.caseSensitive}
            searchUseRegex={searchState.useRegex}
            currentMatchIndex={searchState.currentIndex}
            onTextChange={handleRawTextChange}
            onSaveFile={handleSaveFile}
          />
        ) : (
          <VirtualTable
            metadata={metadata}
            hasHeader={hasHeader}
            activeCell={activeCell}
            setActiveCell={setActiveCell}
            onActiveCellChange={handleActiveCellChange}
            currentSearchMatch={currentMatch}
            sortConfig={sortConfig}
            onSortColumn={handleSortColumn}
            onCellEdited={handleCellEdited}
            onBatchCellEdited={handleBatchCellEdited}
            onSelectionStatsChange={setSelectionStats}
            modifiedCells={modifiedCells}
            jumpToRowTrigger={jumpToRowTrigger}
            filterIndices={matchedRowIndices}
            filterMode={searchState.filterMode}
            searchQuery={searchState.query}
            searchCaseSensitive={searchState.caseSensitive}
            searchUseRegex={searchState.useRegex}
            onInsertRow={handleInsertRow}
            onDeleteRow={handleDeleteRow}
            onDuplicateRow={handleDuplicateRow}
            onInsertCol={handleInsertCol}
            onDeleteCol={handleDeleteCol}
            onDuplicateCol={handleDuplicateCol}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />
        )
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-[#0F1115] text-gray-500 dark:text-gray-400 p-8 select-none">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isTauriEnv()) {
                return;
              }
              if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleOpenFile(e.dataTransfer.files[0]);
              }
            }}
            className="max-w-md w-full border-2 border-dashed border-gray-300 dark:border-[#2D3139] rounded-2xl p-10 flex flex-col items-center text-center hover:border-blue-500/60 dark:hover:border-blue-500/60 transition-colors cursor-pointer"
            onClick={handleTriggerOpenFile}
          >
            <div className="p-4 bg-blue-50 dark:bg-blue-950/40 rounded-full text-blue-600 dark:text-blue-400 mb-4">
              <FileSpreadsheet className="w-10 h-10" />
            </div>
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-200 mb-1">
              CSV / TSV ファイルを開く
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
              ファイルをここにドラッグ＆ドロップするか、<br />下のボタンからファイルを選択してください。
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleTriggerOpenFile();
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center gap-2"
            >
              <FolderOpen className="w-4 h-4" />
              <span>ファイルを選択</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. ステータスバー */}
      <StatusBar
        metadata={metadata}
        activeCell={activeCell}
        activeCellValue={activeCellValue}
        hasHeader={hasHeader}
        selectionStats={selectionStats}
        onEncodingChange={handleEncodingChange}
        onLineEndingChange={handleLineEndingChange}
        onDelimiterChange={handleDelimiterChange}
      />

      {/* 5. 各種モーダル */}
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <SaveModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        metadata={metadata}
        onSaveConfirm={handleSaveConfirm}
      />
      {metadata && (
        <SplitModal
          isOpen={isSplitModalOpen}
          onClose={() => setIsSplitModalOpen(false)}
          metadata={metadata}
          filterIndices={searchState.filterMode ? matchedRowIndices : null}
        />
      )}
      {metadata && (
        <FindReplaceModal
          isOpen={isFindReplaceOpen}
          onClose={() => setIsFindReplaceOpen(false)}
          metadata={metadata}
          currentMatchIndex={searchState.currentIndex}
          totalMatches={searchState.matches.length}
          onFindNext={handleFindNextInModal}
          onFindPrev={handleFindPrevInModal}
          onReplaceCurrent={handleReplaceCurrentInModal}
          onReplaceAll={handleReplaceAllInModal}
        />
      )}

      {/* 全画面ドラッグ＆ドロップ オーバーレイ */}
      {isDragging && (
        <div
          id="drop-overlay-full"
          className="fixed inset-0 z-50 bg-blue-600/20 backdrop-blur-[2px] border-4 border-dashed border-blue-500 flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-150"
        >
          <div className="bg-white dark:bg-[#1A1D23] px-8 py-6 rounded-2xl shadow-2xl flex flex-col items-center border border-blue-500/40 transform scale-105 transition-transform">
            <div className="p-4 bg-blue-100 dark:bg-blue-950/60 rounded-full text-blue-600 dark:text-blue-400 mb-3 animate-bounce">
              <FileSpreadsheet className="w-12 h-12" />
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1">
              ファイルをドロップして開く
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              CSV / TSV ファイルを瞬時に読み込みます
            </p>
          </div>
        </div>
      )}

      {/* 隠し input[type="file"] */}
      <input
        id="btn-open-file"
        type="file"
        accept=".csv,.tsv,.txt,.dat,text/csv,text/tab-separated-values,text/plain"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleOpenFile(e.target.files[0]);
          }
        }}
      />
    </div>
  );
}
