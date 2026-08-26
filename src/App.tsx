// UPDATE 2026-08-26: [Undo/Redo 履歴管理 & 行・列の追加/複製/削除 & 高速ファイル分割]
// 1. Undo/Redo スタック (undoStack, redoStack) によるセルの値変更・行/列の構造編集の完全巻き戻し/再適用
// 2. 行・列の挿入/複製/削除操作ハンドラの実装と Worker 連携
// 3. 高速ファイル分割モーダル (SplitModal) の統合
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TitleBar } from './components/TitleBar';
import { Toolbar } from './components/Toolbar';
import { VirtualTable } from './components/VirtualTable';
import { RawTextView } from './components/RawTextView';
import { StatusBar } from './components/StatusBar';
import { HelpModal } from './components/HelpModal';
import { SaveModal } from './components/SaveModal';
import { SplitModal } from './components/SplitModal';
import {
  FileMetadata,
  SupportedEncoding,
  SupportedLineEnding,
  SupportedDelimiter,
  CellCoordinate,
  SearchState,
  SortConfig,
  ViewMode,
  HistoryAction,
} from './types/csv';
import { TauriBridge } from './services/tauriBridge';
import { generateBenchmarkCsv } from './utils/sampleData';
import { useTheme } from './hooks/useTheme';

export default function App() {
  const { themeMode, setThemeMode, resolvedTheme } = useTheme();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [metadata, setMetadata] = useState<FileMetadata | null>(null);
  const [hasHeader, setHasHeader] = useState<boolean>(true);
  const [activeCell, setActiveCell] = useState<CellCoordinate | null>({ row: 0, col: 0 });
  const [activeCellValue, setActiveCellValue] = useState<string>('');
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [jumpInput, setJumpInput] = useState('');
  const [jumpToRowTrigger, setJumpToRowTrigger] = useState<number | null>(null);

  // UPDATE 2026-08-26: 表示モード ('table' | 'text') & 未保存セル追跡 Set
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [rawText, setRawText] = useState<string>('');
  const [modifiedCells, setModifiedCells] = useState<Set<string>>(new Set());

  // UPDATE 2026-08-26: [Undo/Redo 履歴スタック]
  const [undoStack, setUndoStack] = useState<HistoryAction[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryAction[]>([]);

  // 検索ステート (useRegex, regexError, filterMode を含む)
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

  // ソート設定
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    column: null,
    direction: null,
  });

  // 検索一致行のユニークな物理行インデックス一覧（昇順）
  const matchedRowIndices = useMemo(() => {
    if (!searchState.matches || searchState.matches.length === 0) return [];
    const rowSet = new Set<number>();
    for (const m of searchState.matches) {
      rowSet.add(m.row);
    }
    return Array.from(rowSet).sort((a, b) => a - b);
  }, [searchState.matches]);

  // アプリ起動直後に即座にテーブルを表示（10,000行ベンチマークデータ）
  useEffect(() => {
    loadBenchmarkData(10000, false);
  }, []);

  const loadBenchmarkData = async (count: number, isTsv: boolean = false) => {
    try {
      const csvText = generateBenchmarkCsv(count, isTsv);
      const fileName = isTsv ? `benchmark_dataset_${count}rows.tsv` : `benchmark_dataset_${count}rows.csv`;
      const meta = await TauriBridge.openFromText(csvText, fileName, isTsv ? '\t' : ',');
      setMetadata(meta);
      setHasHeader(meta.hasHeader ?? true);
      setActiveCell({ row: 0, col: 0 });
      setModifiedCells(new Set());
      setSearchState((prev) => ({
        ...prev,
        query: '',
        matches: [],
        currentIndex: 0,
        regexError: null,
        filterMode: false,
      }));
      setJumpToRowTrigger(0);
    } catch (err) {
      console.error('Failed to load benchmark data:', err);
    }
  };

  // ファイルオープン
  const handleOpenFile = async (file: File) => {
    try {
      const meta = await TauriBridge.openFile(file);
      setMetadata(meta);
      setHasHeader(meta.hasHeader ?? true);
      setActiveCell({ row: 0, col: 0 });
      setModifiedCells(new Set());
      setSearchState((prev) => ({
        ...prev,
        query: '',
        matches: [],
        currentIndex: 0,
        regexError: null,
        filterMode: false,
      }));
      setJumpToRowTrigger(0);
      if (viewMode === 'text') {
        const text = await TauriBridge.getCurrentText(meta.lineEnding, meta.delimiter);
        setRawText(text);
      }
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  };

  // 表示モード切替 (表プレビュー ⇔ テキスト表示)
  const handleToggleViewMode = async (mode: ViewMode) => {
    if (mode === 'text' && metadata) {
      try {
        const text = await TauriBridge.getCurrentText(metadata.lineEnding, metadata.delimiter);
        setRawText(text);
      } catch (err) {
        console.error('Failed to get raw text:', err);
      }
    }
    setViewMode(mode);
  };

  // テキスト直接編集時の同期
  const handleRawTextChange = async (newText: string) => {
    setRawText(newText);
    if (!metadata) return;
    try {
      const updatedMeta = await TauriBridge.updateFromText(newText, metadata.delimiter);
      setMetadata(updatedMeta);
    } catch (err) {
      console.error('Failed to update from text:', err);
    }
  };

  // ヘッダ有無切替
  const handleToggleHasHeader = async (val: boolean) => {
    try {
      const updated = await TauriBridge.setHasHeader(val);
      setHasHeader(val);
      setMetadata((prev) =>
        prev
          ? {
              ...prev,
              totalRows: updated.totalRows,
              totalCols: updated.totalCols,
              headers: updated.headers,
              hasHeader: updated.hasHeader,
            }
          : null
      );
      // 検索結果の再評価
      if (searchState.query) {
        const { matches, error } = await TauriBridge.search(
          searchState.query,
          searchState.caseSensitive,
          searchState.useRegex,
          searchState.columnFilter
        );
        setSearchState((prev) => ({
          ...prev,
          matches,
          regexError: error,
          currentIndex: 0,
        }));
      }
    } catch (err) {
      console.error('Failed to toggle hasHeader:', err);
    }
  };

  // 保存ダイアログ
  const handleSaveFile = () => {
    if (!metadata) return;
    setIsSaveModalOpen(true);
  };

  // 保存モーダルで確定された設定で保存実行
  const handleSaveConfirm = async (options: {
    filename: string;
    encoding: SupportedEncoding;
    lineEnding: SupportedLineEnding;
    delimiter: SupportedDelimiter;
    includeBom: boolean;
  }) => {
    if (!metadata) return;

    try {
      await TauriBridge.saveFile(
        options.filename,
        options.encoding,
        options.lineEnding,
        options.delimiter
      );

      // 保存完了時に未保存セルマークをリセット
      await TauriBridge.clearModifiedCells();
      setModifiedCells(new Set());

      setMetadata((prev) =>
        prev
          ? {
              ...prev,
              fileName: options.filename,
              encoding: options.encoding,
              lineEnding: options.lineEnding,
              delimiter: options.delimiter,
              isDirty: false,
            }
          : null
      );
    } catch (err) {
      console.error('Failed to save file:', err);
    }
  };

  // 区切り文字変更
  const handleDelimiterChange = async (delimiter: SupportedDelimiter) => {
    if (!metadata) return;
    try {
      const updatedMeta = await TauriBridge.reloadWithEncoding(metadata.encoding, delimiter);
      setMetadata(updatedMeta);
      setActiveCellValue('');
      setModifiedCells(new Set());
      if (searchState.query) {
        executeSearch(
          searchState.query,
          searchState.caseSensitive,
          searchState.useRegex,
          searchState.columnFilter
        );
      }
    } catch (err) {
      console.error('Failed to change delimiter:', err);
    }
  };

  // エンコーディング変更
  const handleEncodingChange = async (encoding: SupportedEncoding) => {
    if (!metadata) return;
    try {
      const updatedMeta = await TauriBridge.reloadWithEncoding(encoding, metadata.delimiter);
      setMetadata(updatedMeta);
      setActiveCellValue('');
      setModifiedCells(new Set());
      if (searchState.query) {
        executeSearch(
          searchState.query,
          searchState.caseSensitive,
          searchState.useRegex,
          searchState.columnFilter
        );
      }
    } catch (err) {
      console.error('Failed to reload with encoding:', err);
      setMetadata((prev) => (prev ? { ...prev, encoding, isDirty: true } : null));
    }
  };

  // 改行コード変更
  const handleLineEndingChange = (lineEnding: SupportedLineEnding) => {
    if (!metadata) return;
    setMetadata((prev) => (prev ? { ...prev, lineEnding, isDirty: true } : null));
  };

  // アクティブセル同期
  const handleActiveCellChange = useCallback((coord: CellCoordinate | null, value: string) => {
    setActiveCell(coord);
    setActiveCellValue(value);
  }, []);

  // セル編集完了コールバック (未保存セルのSetに追加 & isDirty更新 & Undoスタック記録)
  const handleCellEdited = async (row: number, col: number, value: string) => {
    try {
      const prevValue = await TauriBridge.getCellValue(row, col);
      if (prevValue === value) return;

      await TauriBridge.editCell(row, col, value);
      setActiveCellValue(value);
      setModifiedCells((prev) => new Set(prev).add(`${row},${col}`));
      setMetadata((prev) => (prev ? { ...prev, isDirty: true } : null));

      setUndoStack((prev) => [
        ...prev,
        {
          type: 'EDIT_CELL',
          row,
          col,
          prevValue,
          newValue: value,
        },
      ]);
      setRedoStack([]);
    } catch (err) {
      console.error('Failed to edit cell:', err);
    }
  };

  // UPDATE 2026-08-26: [行の挿入 / 削除 / 複製ハンドラ]
  const handleInsertRow = async (row: number, rowData?: string[]) => {
    try {
      const updatedMeta = await TauriBridge.insertRow(row, rowData);
      setMetadata((prev) => (prev ? { ...prev, ...updatedMeta, isDirty: true } : null));
      const actualRowData = rowData || new Array(metadata?.totalCols || 0).fill('');
      setUndoStack((prev) => [
        ...prev,
        {
          type: 'INSERT_ROW',
          row,
          rowData: actualRowData,
        },
      ]);
      setRedoStack([]);
      // 挿入された行へ移動
      setActiveCell({ row, col: activeCell?.col || 0 });
      setJumpToRowTrigger(row);
    } catch (err) {
      console.error('Failed to insert row:', err);
    }
  };

  const handleDeleteRow = async (row: number) => {
    try {
      const res = await TauriBridge.deleteRow(row);
      setMetadata((prev) =>
        prev
          ? {
              ...prev,
              totalRows: res.totalRows ?? prev.totalRows - 1,
              isDirty: true,
            }
          : null
      );
      setUndoStack((prev) => [
        ...prev,
        {
          type: 'DELETE_ROW',
          row,
          rowData: res.deletedData,
        },
      ]);
      setRedoStack([]);
      if (activeCell && activeCell.row >= (metadata?.totalRows || 1) - 1) {
        setActiveCell({ row: Math.max(0, (metadata?.totalRows || 1) - 2), col: activeCell.col });
      }
    } catch (err) {
      console.error('Failed to delete row:', err);
    }
  };

  const handleDuplicateRow = async (sourceRow: number) => {
    try {
      const res = await TauriBridge.duplicateRow(sourceRow);
      setMetadata((prev) =>
        prev
          ? {
              ...prev,
              totalRows: res.totalRows ?? prev.totalRows + 1,
              isDirty: true,
            }
          : null
      );
      setUndoStack((prev) => [
        ...prev,
        {
          type: 'DUPLICATE_ROW',
          sourceRow,
          targetRow: res.insertedRow,
          rowData: res.rowData,
        },
      ]);
      setRedoStack([]);
      setActiveCell({ row: res.insertedRow, col: activeCell?.col || 0 });
      setJumpToRowTrigger(res.insertedRow);
    } catch (err) {
      console.error('Failed to duplicate row:', err);
    }
  };

  // UPDATE 2026-08-26: [列の挿入 / 削除 / 複製ハンドラ]
  const handleInsertCol = async (col: number, headerName?: string) => {
    try {
      const updatedMeta = await TauriBridge.insertCol(col, headerName);
      setMetadata((prev) => (prev ? { ...prev, ...updatedMeta, isDirty: true } : null));
      const actualHeader = headerName || `Col ${col + 1}`;
      setUndoStack((prev) => [
        ...prev,
        {
          type: 'INSERT_COL',
          col,
          headerName: actualHeader,
        },
      ]);
      setRedoStack([]);
      setActiveCell({ row: activeCell?.row || 0, col });
    } catch (err) {
      console.error('Failed to insert column:', err);
    }
  };

  const handleDeleteCol = async (col: number) => {
    try {
      const res = await TauriBridge.deleteCol(col);
      setMetadata((prev) =>
        prev
          ? {
              ...prev,
              totalCols: res.totalCols ?? prev.totalCols - 1,
              headers: res.headers ?? prev.headers,
              isDirty: true,
            }
          : null
      );
      setUndoStack((prev) => [
        ...prev,
        {
          type: 'DELETE_COL',
          col,
          headerName: res.deletedHeader,
          colValues: res.deletedColValues,
        },
      ]);
      setRedoStack([]);
      if (activeCell && activeCell.col >= (metadata?.totalCols || 1) - 1) {
        setActiveCell({ row: activeCell.row, col: Math.max(0, (metadata?.totalCols || 1) - 2) });
      }
    } catch (err) {
      console.error('Failed to delete column:', err);
    }
  };

  const handleDuplicateCol = async (sourceCol: number) => {
    try {
      const res = await TauriBridge.duplicateCol(sourceCol);
      setMetadata((prev) =>
        prev
          ? {
              ...prev,
              totalCols: res.totalCols ?? prev.totalCols + 1,
              headers: res.headers ?? prev.headers,
              isDirty: true,
            }
          : null
      );
      setUndoStack((prev) => [
        ...prev,
        {
          type: 'DUPLICATE_COL',
          sourceCol,
          targetCol: res.insertedCol,
          headerName: res.headerName,
          colValues: res.colValues,
        },
      ]);
      setRedoStack([]);
      setActiveCell({ row: activeCell?.row || 0, col: res.insertedCol });
    } catch (err) {
      console.error('Failed to duplicate column:', err);
    }
  };

  // UPDATE 2026-08-26: [Undo / Redo 実行ロジック]
  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const action = undoStack[undoStack.length - 1];
    const newUndoStack = undoStack.slice(0, -1);

    try {
      switch (action.type) {
        case 'EDIT_CELL': {
          await TauriBridge.editCell(action.row, action.col, action.prevValue);
          setActiveCell({ row: action.row, col: action.col });
          setActiveCellValue(action.prevValue);
          setJumpToRowTrigger(action.row);
          break;
        }
        case 'INSERT_ROW': {
          // 挿入した行を削除
          const res = await TauriBridge.deleteRow(action.row);
          setMetadata((prev) => (prev ? { ...prev, totalRows: res.totalRows ?? prev.totalRows - 1 } : null));
          break;
        }
        case 'DELETE_ROW': {
          // 削除した行を再挿入
          const res = await TauriBridge.insertRow(action.row, action.rowData);
          setMetadata((prev) => (prev ? { ...prev, ...res } : null));
          setActiveCell({ row: action.row, col: activeCell?.col || 0 });
          setJumpToRowTrigger(action.row);
          break;
        }
        case 'DUPLICATE_ROW': {
          // 複製された行を削除
          const res = await TauriBridge.deleteRow(action.targetRow);
          setMetadata((prev) => (prev ? { ...prev, totalRows: res.totalRows ?? prev.totalRows - 1 } : null));
          break;
        }
        case 'INSERT_COL': {
          // 挿入した列を削除
          const res = await TauriBridge.deleteCol(action.col);
          setMetadata((prev) => (prev ? { ...prev, totalCols: res.totalCols ?? prev.totalCols - 1, headers: res.headers ?? prev.headers } : null));
          break;
        }
        case 'DELETE_COL': {
          // 削除した列を再挿入
          const res = await TauriBridge.insertCol(action.col, action.headerName);
          // 列の各セル値を復元
          for (let r = 0; r < action.colValues.length; r++) {
            await TauriBridge.editCell(r, action.col, action.colValues[r]);
          }
          setMetadata((prev) => (prev ? { ...prev, ...res } : null));
          break;
        }
        case 'DUPLICATE_COL': {
          // 複製された列を削除
          const res = await TauriBridge.deleteCol(action.targetCol);
          setMetadata((prev) => (prev ? { ...prev, totalCols: res.totalCols ?? prev.totalCols - 1, headers: res.headers ?? prev.headers } : null));
          break;
        }
      }

      setUndoStack(newUndoStack);
      setRedoStack((prev) => [...prev, action]);
    } catch (err) {
      console.error('Failed to execute Undo:', err);
    }
  };

  const handleRedo = async () => {
    if (redoStack.length === 0) return;
    const action = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, -1);

    try {
      switch (action.type) {
        case 'EDIT_CELL': {
          await TauriBridge.editCell(action.row, action.col, action.newValue);
          setActiveCell({ row: action.row, col: action.col });
          setActiveCellValue(action.newValue);
          setJumpToRowTrigger(action.row);
          break;
        }
        case 'INSERT_ROW': {
          const res = await TauriBridge.insertRow(action.row, action.rowData);
          setMetadata((prev) => (prev ? { ...prev, ...res } : null));
          setActiveCell({ row: action.row, col: activeCell?.col || 0 });
          setJumpToRowTrigger(action.row);
          break;
        }
        case 'DELETE_ROW': {
          const res = await TauriBridge.deleteRow(action.row);
          setMetadata((prev) => (prev ? { ...prev, totalRows: res.totalRows ?? prev.totalRows - 1 } : null));
          break;
        }
        case 'DUPLICATE_ROW': {
          const res = await TauriBridge.duplicateRow(action.sourceRow, action.targetRow);
          setMetadata((prev) => (prev ? { ...prev, totalRows: res.totalRows ?? prev.totalRows + 1 } : null));
          setActiveCell({ row: action.targetRow, col: activeCell?.col || 0 });
          setJumpToRowTrigger(action.targetRow);
          break;
        }
        case 'INSERT_COL': {
          const res = await TauriBridge.insertCol(action.col, action.headerName);
          setMetadata((prev) => (prev ? { ...prev, ...res } : null));
          break;
        }
        case 'DELETE_COL': {
          const res = await TauriBridge.deleteCol(action.col);
          setMetadata((prev) => (prev ? { ...prev, totalCols: res.totalCols ?? prev.totalCols - 1, headers: res.headers ?? prev.headers } : null));
          break;
        }
        case 'DUPLICATE_COL': {
          const res = await TauriBridge.duplicateCol(action.sourceCol, action.targetCol, action.headerName);
          setMetadata((prev) => (prev ? { ...prev, totalCols: res.totalCols ?? prev.totalCols + 1, headers: res.headers ?? prev.headers } : null));
          break;
        }
      }

      setRedoStack(newRedoStack);
      setUndoStack((prev) => [...prev, action]);
    } catch (err) {
      console.error('Failed to execute Redo:', err);
    }
  };

  // 検索クエリ実行
  const executeSearch = useCallback(
    async (
      query: string,
      caseSensitive: boolean,
      useRegex: boolean,
      colFilter: number | null
    ) => {
      if (!query.trim()) {
        setSearchState((prev) => ({
          ...prev,
          query,
          matches: [],
          currentIndex: 0,
          regexError: null,
          filterMode: false,
        }));
        return;
      }
      try {
        const { matches, error } = await TauriBridge.search(
          query,
          caseSensitive,
          useRegex,
          colFilter
        );
        setSearchState((prev) => ({
          ...prev,
          query,
          caseSensitive,
          useRegex,
          regexError: error,
          columnFilter: colFilter,
          matches,
          currentIndex: 0,
        }));
        if (matches.length > 0) {
          const first = matches[0];
          setActiveCell({ row: first.row, col: first.col });
          setActiveCellValue(first.value);
          setJumpToRowTrigger(first.row);
        }
      } catch (err) {
        console.error('Search failed:', err);
      }
    },
    []
  );

  const handleSearchChange = (query: string) => {
    setSearchState((prev) => ({ ...prev, query }));
    executeSearch(query, searchState.caseSensitive, searchState.useRegex, searchState.columnFilter);
  };

  const handleToggleCaseSensitive = () => {
    const nextVal = !searchState.caseSensitive;
    setSearchState((prev) => ({ ...prev, caseSensitive: nextVal }));
    executeSearch(searchState.query, nextVal, searchState.useRegex, searchState.columnFilter);
  };

  const handleToggleRegex = () => {
    const nextVal = !searchState.useRegex;
    setSearchState((prev) => ({ ...prev, useRegex: nextVal }));
    executeSearch(searchState.query, searchState.caseSensitive, nextVal, searchState.columnFilter);
  };

  const handleToggleFilterMode = () => {
    setSearchState((prev) => ({ ...prev, filterMode: !prev.filterMode }));
  };

  const handleColumnFilterChange = (colIndex: number | null) => {
    setSearchState((prev) => ({ ...prev, columnFilter: colIndex }));
    executeSearch(searchState.query, searchState.caseSensitive, searchState.useRegex, colIndex);
  };

  const handleNextMatch = () => {
    if (searchState.matches.length === 0) return;
    const nextIdx = (searchState.currentIndex + 1) % searchState.matches.length;
    setSearchState((prev) => ({ ...prev, currentIndex: nextIdx }));
    const match = searchState.matches[nextIdx];
    setActiveCell({ row: match.row, col: match.col });
    setActiveCellValue(match.value);
    setJumpToRowTrigger(match.row);
  };

  const handlePrevMatch = () => {
    if (searchState.matches.length === 0) return;
    const prevIdx =
      (searchState.currentIndex - 1 + searchState.matches.length) % searchState.matches.length;
    setSearchState((prev) => ({ ...prev, currentIndex: prevIdx }));
    const match = searchState.matches[prevIdx];
    setActiveCell({ row: match.row, col: match.col });
    setActiveCellValue(match.value);
    setJumpToRowTrigger(match.row);
  };

  const handleJumpToRow = (rowNumber: number) => {
    if (!metadata) return;
    const bounded = Math.max(0, Math.min(rowNumber, metadata.totalRows - 1));
    setActiveCell((prev) => ({ row: bounded, col: prev?.col || 0 }));
    setJumpToRowTrigger(bounded);
  };

  // カラムソート
  const handleSortColumn = (colIndex: number) => {
    setSortConfig((prev) => {
      if (prev.column === colIndex) {
        if (prev.direction === 'asc') return { column: colIndex, direction: 'desc' };
        if (prev.direction === 'desc') return { column: null, direction: null };
      }
      return { column: colIndex, direction: 'asc' };
    });
  };

  // グローバルドラッグ＆ドロップおよびキーボードショートカット (F1, Ctrl+S, Ctrl+O, Ctrl+F 等)
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
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
        document.getElementById('btn-open-file')?.click();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const searchInput = document.getElementById('input-search-csv') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    window.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [metadata, viewMode]);

  const currentMatch =
    searchState.matches.length > 0 ? searchState.matches[searchState.currentIndex] : null;

  return (
// UPDATE 2026-08-26: [ライト/ダークテーマ完全両立スタイリング]
// なぜ: 無効な light: プレフィックスを排除し、デフォルト（ライト）と dark: バリアントによる確実なテーマ切り替えを実現するため
    <div
      id="qu-app-root"
      className="flex flex-col h-screen w-screen overflow-hidden bg-[#FAFAFA] dark:bg-[#0F1115] text-gray-800 dark:text-[#D1D5DB] font-mono select-none"
    >
      {/* 1. タイトルバー (テーマ切替 & ヘルプボタン搭載) */}
      <TitleBar
        metadata={metadata}
        alwaysOnTop={alwaysOnTop}
        onToggleAlwaysOnTop={() => setAlwaysOnTop(!alwaysOnTop)}
        onLoadBenchmark={loadBenchmarkData}
        themeMode={themeMode}
        onThemeChange={setThemeMode}
        onOpenHelp={() => setIsHelpOpen(true)}
      />

      {/* 2. ツールバー（ファイル開く・保存、Undo/Redo、ファイル分割、表示切替[表/テキスト]、超高速固定幅検索、クリアボタン、正規表現トグル、行フィルタ、ヘッダ切替、文字コード切替） */}
      <Toolbar
        metadata={metadata}
        hasHeader={hasHeader}
        onToggleHasHeader={handleToggleHasHeader}
        onOpenFile={handleOpenFile}
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
        <div className="flex-1 flex items-center justify-center bg-white dark:bg-[#0F1115] text-gray-500 text-sm">
          ファイルをドラッグ＆ドロップしてください
        </div>
      )}

      {/* 4. ステータスバー (未保存編集箇所バッジ表示) */}
      <StatusBar
        metadata={metadata}
        activeCell={activeCell}
        activeCellValue={activeCellValue}
        isFilterActive={searchState.filterMode}
        filteredCount={matchedRowIndices.length}
        modifiedCount={modifiedCells.size}
      />

      {/* 5. ヘルプ＆ショートカットモーダル (F1 / ? ボタン) */}
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      {/* 6. 保存ダイアログモーダル (Ctrl+S / 保存ボタン) */}
      <SaveModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        metadata={metadata}
        onSaveConfirm={handleSaveConfirm}
      />

      {/* 7. 大規模ファイル高速分割モーダル */}
      <SplitModal
        isOpen={isSplitModalOpen}
        onClose={() => setIsSplitModalOpen(false)}
        metadata={metadata}
      />
    </div>
  );
}
