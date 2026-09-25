import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  FileMetadata,
  CellCoordinate,
  CellRange,
  SearchMatch,
  SortConfig,
  SelectionStats,
} from '../types/csv';
import { TauriBridge } from '../services/tauriBridge';
import { Copy } from 'lucide-react';
import { TableContextMenu, ContextMenuTarget } from './TableContextMenu';
import {
  ROW_HEIGHT,
  ROW_NUM_WIDTH,
  OVERSCAN_ROWS,
  OVERSCAN_COLS,
  CHUNK_SIZE,
  MAX_CACHED_ROWS,
  DEFAULT_COL_WIDTH,
} from './table/tableConstants';
import { useColumnResize } from './table/useColumnResize';
import { useTableClipboard } from './table/useTableClipboard';
import { TableHeader } from './table/TableHeader';
import { TableRow } from './table/TableRow';

interface VirtualTableProps {
  metadata: FileMetadata;
  hasHeader?: boolean;
  activeCell: CellCoordinate | null;
  setActiveCell: (coord: CellCoordinate | null) => void;
  onActiveCellChange?: (coord: CellCoordinate | null, value: string) => void;
  currentSearchMatch: SearchMatch | null;
  sortConfig: SortConfig;
  onSortColumn: (colIndex: number) => void;
  onCellEdited: (row: number, col: number, value: string, prevValue?: string) => void;
  onBatchCellEdited?: (changes: Array<{ row: number; col: number; prevValue: string; newValue: string }>) => void;
  onSelectionStatsChange?: (stats: SelectionStats | null) => void;
  modifiedCells?: Set<string>;
  jumpToRowTrigger: number | null;
  filterIndices?: number[] | null;
  filterMode?: boolean;
  searchQuery?: string;
  searchCaseSensitive?: boolean;
  searchUseRegex?: boolean;
  onInsertRow?: (row: number, rowData?: string[]) => void;
  onDeleteRow?: (row: number) => void;
  onDuplicateRow?: (row: number) => void;
  onInsertCol?: (col: number, headerName?: string) => void;
  onDeleteCol?: (col: number) => void;
  onDuplicateCol?: (col: number) => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const VirtualTable: React.FC<VirtualTableProps> = ({
  metadata,
  hasHeader = true,
  activeCell,
  setActiveCell,
  onActiveCellChange,
  currentSearchMatch,
  sortConfig,
  onSortColumn,
  onCellEdited,
  onBatchCellEdited,
  onSelectionStatsChange,
  modifiedCells,
  jumpToRowTrigger,
  filterIndices,
  filterMode = false,
  searchQuery = '',
  searchCaseSensitive = false,
  searchUseRegex = false,
  onInsertRow,
  onDeleteRow,
  onDuplicateRow,
  onInsertCol,
  onDeleteCol,
  onDuplicateCol,
  onUndo,
  onRedo,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const [containerWidth, setContainerWidth] = useState(1280);

  // セル範囲選択ステート
  const [selectedRange, setSelectedRange] = useState<CellRange | null>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<CellCoordinate | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [contextMenuTarget, setContextMenuTarget] = useState<ContextMenuTarget | null>(null);

  // セル直接編集ステート (物理行番号, 列番号, 仮想行インデックス, 初期値)
  const [editingCell, setEditingCell] = useState<{
    row: number;
    col: number;
    virtualIdx: number;
    initialValue: string;
  } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // 検索ヒット位置・外部ジャンプの重複発火防止用
  const lastSearchMatchRef = useRef<{ row: number; col: number } | null>(null);
  const lastJumpRowRef = useRef<number | null>(null);

  // 広域チャンクキャッシュ＆同期レンダリング用 Refs
  const requestIdRef = useRef<number>(0);
  const rowCacheRef = useRef<Map<number, string[]>>(new Map());
  const fetchingChunksRef = useRef<Set<number>>(new Set());
  const scrollDirectionRef = useRef<'down' | 'up'>('down');
  const lastScrollTopRef = useRef<number>(0);
  const [cacheVersion, setCacheVersion] = useState<number>(0);

  // カラム幅管理カスタムフック
  const {
    columnWidths,
    columnOffsets,
    totalTableWidth,
    handleAutoFitColumn,
    handleMouseDownResize,
  } = useColumnResize({ metadata, rowCacheRef });

  // 有効な行総数 (フィルタモード時はフィルタ該当件数)
  const effectiveTotalRows = useMemo(() => {
    if (filterMode && filterIndices) {
      return filterIndices.length;
    }
    return metadata.totalRows;
  }, [filterMode, filterIndices, metadata.totalRows]);

  // クリップボード操作カスタムフック (TSVコピー、矩形貼り付け)
  const { copyToast, handleCopyTsv, handlePasteClipboard } = useTableClipboard({
    metadata,
    selectedRange,
    activeCell,
    editingCell,
    effectiveTotalRows,
    filterMode,
    filterIndices,
    sortConfig,
    rowCacheRef,
    onBatchCellEdited,
    setCacheVersion,
  });

  // 選択範囲内外の高速判定
  const isCellInRange = useMemo(() => {
    if (!selectedRange) {
      return (r: number, c: number) => activeCell?.row === r && activeCell?.col === c;
    }
    const minR = Math.min(selectedRange.startRow, selectedRange.endRow);
    const maxR = Math.max(selectedRange.startRow, selectedRange.endRow);
    const minC = Math.min(selectedRange.startCol, selectedRange.endCol);
    const maxC = Math.max(selectedRange.startCol, selectedRange.endCol);
    return (r: number, c: number) => r >= minR && r <= maxR && c >= minC && c <= maxC;
  }, [selectedRange, activeCell]);

  const isRowSelected = useMemo(() => {
    if (selectedRange) {
      const minR = Math.min(selectedRange.startRow, selectedRange.endRow);
      const maxR = Math.max(selectedRange.startRow, selectedRange.endRow);
      return (r: number) => r >= minR && r <= maxR;
    }
    return (r: number) => activeCell?.row === r;
  }, [selectedRange, activeCell]);

  // ドラッグ選択終了の監視
  useEffect(() => {
    const handleMouseUp = () => {
      setIsSelecting(false);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // 選択セル範囲の簡易統計
  useEffect(() => {
    if (!onSelectionStatsChange) return;

    if (!selectedRange) {
      onSelectionStatsChange(null);
      return;
    }

    const minR = Math.min(selectedRange.startRow, selectedRange.endRow);
    const maxR = Math.max(selectedRange.startRow, selectedRange.endRow);
    const minC = Math.min(selectedRange.startCol, selectedRange.endCol);
    const maxC = Math.max(selectedRange.startCol, selectedRange.endCol);

    const totalCells = (maxR - minR + 1) * (maxC - minC + 1);
    if (totalCells <= 1) {
      onSelectionStatsChange(null);
      return;
    }

    let numCount = 0;
    let sum = 0;
    let minVal: number | null = null;
    let maxVal: number | null = null;

    const cache = rowCacheRef.current;
    for (let virtualR = minR; virtualR <= maxR; virtualR++) {
      const row = cache.get(virtualR);
      if (row) {
        for (let c = minC; c <= maxC; c++) {
          const val = row[c] ?? '';
          const clean = val.replace(/,/g, '').trim();
          if (clean !== '' && !isNaN(Number(clean))) {
            const num = Number(clean);
            numCount++;
            sum += num;
            if (minVal === null || num < minVal) minVal = num;
            if (maxVal === null || num > maxVal) maxVal = num;
          }
        }
      }
    }

    onSelectionStatsChange({
      selectedCount: totalCells,
      numericCount: numCount,
      sum: numCount > 0 ? sum : null,
      avg: numCount > 0 ? sum / numCount : null,
      min: minVal,
      max: maxVal,
    });
  }, [selectedRange, onSelectionStatsChange]);

  // コンテナのリサイズ監視 (幅と高さを同時に追跡)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ファイル切替時や初期ロード時にテーブルコンテナへ自動フォーカス
  useEffect(() => {
    if (metadata && containerRef.current) {
      containerRef.current.focus();
    }
  }, [metadata.filePath]);

  // 画面枠内に即時描画すべき行範囲 (Overscan 15行)
  const { renderStartRow, renderRowCount } = useMemo(() => {
    const total = effectiveTotalRows;
    const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT);
    const firstVisible = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT));
    const start = Math.max(0, firstVisible - OVERSCAN_ROWS);
    const end = Math.min(total, firstVisible + visibleCount + OVERSCAN_ROWS);
    return {
      renderStartRow: start,
      renderRowCount: Math.max(0, end - start),
    };
  }, [scrollTop, containerHeight, effectiveTotalRows]);

  // 横スクロール位置に基づく可視列のインデックス範囲 (Overscan 左右3列)
  const { renderStartCol, renderEndCol } = useMemo(() => {
    const totalCols = metadata.headers.length;
    if (totalCols === 0) return { renderStartCol: 0, renderEndCol: 0 };

    const viewLeft = scrollLeft;
    const viewRight = scrollLeft + containerWidth;

    let start = 0;
    while (
      start < totalCols &&
      columnOffsets[start] + (columnWidths[start] || DEFAULT_COL_WIDTH) < viewLeft
    ) {
      start++;
    }
    start = Math.max(0, start - OVERSCAN_COLS);

    let end = start;
    while (end < totalCols && columnOffsets[end] < viewRight) {
      end++;
    }
    end = Math.min(totalCols, end + OVERSCAN_COLS);

    return {
      renderStartCol: start,
      renderEndCol: Math.max(start + 1, end),
    };
  }, [scrollLeft, containerWidth, metadata.headers.length, columnOffsets, columnWidths]);

  // チャンク単位での非同期データ取得 (2,000行ブロック)
  const fetchChunk = useCallback(
    async (chunkIndex: number, fIndices?: number[] | null, currentSort?: SortConfig) => {
      if (fetchingChunksRef.current.has(chunkIndex)) return;
      const startRow = chunkIndex * CHUNK_SIZE;
      const total = effectiveTotalRows;
      if (startRow >= total) return;
      const count = Math.min(CHUNK_SIZE, total - startRow);
      if (count <= 0) return;

      fetchingChunksRef.current.add(chunkIndex);
      const thisRequestId = requestIdRef.current;

      try {
        const response = await TauriBridge.getSlice(
          startRow,
          count,
          fIndices || undefined,
          currentSort || undefined
        );

        if (thisRequestId !== requestIdRef.current) {
          fetchingChunksRef.current.delete(chunkIndex);
          return;
        }

        const cache = rowCacheRef.current;
        response.rows.forEach((row, i) => {
          const virtualIdx = response.startRow + i;
          cache.set(virtualIdx, row);
        });

        // キャッシュサイズ制限（最大100,000行を超えたら古いものを削除）
        if (cache.size > MAX_CACHED_ROWS) {
          const keysToDelete = Array.from(cache.keys()).slice(0, cache.size - MAX_CACHED_ROWS);
          keysToDelete.forEach((k) => cache.delete(k));
        }

        setCacheVersion((v) => v + 1);
      } catch (err) {
        if (thisRequestId === requestIdRef.current) {
          console.error(`Failed to fetch chunk ${chunkIndex}:`, err);
        }
      } finally {
        fetchingChunksRef.current.delete(chunkIndex);
      }
    },
    [effectiveTotalRows]
  );

  // ヘッダ有無/ファイル変更時のキャッシュ無効化
  useEffect(() => {
    requestIdRef.current++;
    rowCacheRef.current.clear();
    fetchingChunksRef.current.clear();
    setCacheVersion((v) => v + 1);
  }, [
    filterMode,
    filterIndices,
    sortConfig,
    hasHeader,
    metadata.filePath,
    metadata.fileName,
    metadata.totalRows,
    metadata.totalCols,
    metadata.encoding,
    metadata.delimiter,
  ]);

  // スクロール位置に基づくチャンク取得＆先回りプリフェッチ
  useEffect(() => {
    const total = effectiveTotalRows;
    if (total === 0) {
      rowCacheRef.current.clear();
      fetchingChunksRef.current.clear();
      setCacheVersion((v) => v + 1);
      return;
    }

    const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT);
    const firstVisible = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT));
    const lastVisible = Math.min(total, firstVisible + visibleCount);

    const startChunk = Math.floor(Math.max(0, firstVisible - OVERSCAN_ROWS) / CHUNK_SIZE);
    const endChunk = Math.floor(Math.min(total - 1, lastVisible + OVERSCAN_ROWS) / CHUNK_SIZE);

    const activeFilter = filterMode && filterIndices ? filterIndices : null;

    // 1. 描画領域に必要なチャンクを最優先フェッチ
    for (let chunk = startChunk; chunk <= endChunk; chunk++) {
      const chunkStartRow = chunk * CHUNK_SIZE;
      if (!rowCacheRef.current.has(chunkStartRow)) {
        fetchChunk(chunk, activeFilter, sortConfig);
      }
    }

    // 2. スクロール進行方向の先回りプリフェッチ (最大3チャンク = 6,000行先読み)
    const isDown = scrollDirectionRef.current === 'down';
    const maxChunk = Math.floor((total - 1) / CHUNK_SIZE);
    for (let step = 1; step <= 3; step++) {
      const prefetchChunk = isDown ? endChunk + step : startChunk - step;
      if (prefetchChunk >= 0 && prefetchChunk <= maxChunk) {
        const prefetchStartRow = prefetchChunk * CHUNK_SIZE;
        if (!rowCacheRef.current.has(prefetchStartRow)) {
          fetchChunk(prefetchChunk, activeFilter, sortConfig);
        }
      }
    }
  }, [
    scrollTop,
    containerHeight,
    effectiveTotalRows,
    fetchChunk,
    filterMode,
    filterIndices,
    sortConfig,
    cacheVersion,
  ]);

  // バックグラウンド順次全行プリフェッチ (Idle Stream Loading)
  useEffect(() => {
    const total = effectiveTotalRows;
    if (total === 0) return;
    const maxChunk = Math.floor((total - 1) / CHUNK_SIZE);
    const activeFilter = filterMode && filterIndices ? filterIndices : null;

    let isCancelled = false;
    let nextChunk = 0;

    const idleFetchLoop = () => {
      if (isCancelled) return;
      while (nextChunk <= maxChunk && rowCacheRef.current.has(nextChunk * CHUNK_SIZE)) {
        nextChunk++;
      }

      if (nextChunk <= maxChunk && rowCacheRef.current.size < MAX_CACHED_ROWS) {
        fetchChunk(nextChunk, activeFilter, sortConfig).then(() => {
          nextChunk++;
          if (!isCancelled) {
            setTimeout(idleFetchLoop, 40);
          }
        });
      }
    };

    const timer = setTimeout(idleFetchLoop, 80);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [effectiveTotalRows, fetchChunk, filterMode, filterIndices, sortConfig]);

  // activeCell 変更時に現在値を親へ同期
  useEffect(() => {
    if (!activeCell || !onActiveCellChange) return;

    const rowData = rowCacheRef.current.get(activeCell.row);
    if (rowData && rowData[activeCell.col] !== undefined) {
      onActiveCellChange(activeCell, rowData[activeCell.col]);
    }
  }, [activeCell, onActiveCellChange]);

  // スクロールイベントの同期即時反映
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const currentScroll = e.currentTarget.scrollTop;
    const currentLeft = e.currentTarget.scrollLeft;
    scrollDirectionRef.current = currentScroll >= lastScrollTopRef.current ? 'down' : 'up';
    lastScrollTopRef.current = currentScroll;
    setScrollTop(currentScroll);
    setScrollLeft(currentLeft);
  }, []);

  // 外部からのジャンプ (行ジャンプ等)
  useEffect(() => {
    if (jumpToRowTrigger !== null && containerRef.current) {
      if (lastJumpRowRef.current === jumpToRowTrigger) return;
      lastJumpRowRef.current = jumpToRowTrigger;

      let targetVirtualIndex = jumpToRowTrigger;
      if (filterMode && filterIndices) {
        const foundIdx = filterIndices.indexOf(jumpToRowTrigger);
        if (foundIdx >= 0) targetVirtualIndex = foundIdx;
      }
      const targetScroll = Math.max(0, targetVirtualIndex * ROW_HEIGHT - containerHeight / 3);
      containerRef.current.scrollTop = targetScroll;
      setScrollTop(targetScroll);
      const nextCoord = { row: targetVirtualIndex, col: 0 };
      setActiveCell(nextCoord);
      setSelectionAnchor(nextCoord);
      setSelectedRange({
        startRow: targetVirtualIndex,
        startCol: 0,
        endRow: targetVirtualIndex,
        endCol: metadata.totalCols - 1,
      });
    } else if (jumpToRowTrigger === null) {
      lastJumpRowRef.current = null;
    }
  }, [jumpToRowTrigger, containerHeight, filterMode, filterIndices, setActiveCell, metadata.totalCols]);

  // 検索ヒット位置への自動スクロール＆アクティブセル同期
  useEffect(() => {
    if (!currentSearchMatch || !containerRef.current) {
      lastSearchMatchRef.current = null;
      return;
    }

    const { row: targetPhysicalRow, col: targetCol } = currentSearchMatch;

    if (
      lastSearchMatchRef.current &&
      lastSearchMatchRef.current.row === targetPhysicalRow &&
      lastSearchMatchRef.current.col === targetCol
    ) {
      return;
    }
    lastSearchMatchRef.current = { row: targetPhysicalRow, col: targetCol };

    let targetVirtualRow = targetPhysicalRow;
    if (filterMode && filterIndices) {
      const foundIdx = filterIndices.indexOf(targetPhysicalRow);
      if (foundIdx !== -1) {
        targetVirtualRow = foundIdx;
      } else {
        return;
      }
    }

    const rowTop = targetVirtualRow * ROW_HEIGHT;
    const currentScroll = containerRef.current.scrollTop;
    const isVisible =
      rowTop >= currentScroll &&
      rowTop + ROW_HEIGHT <= currentScroll + containerHeight;

    if (!isVisible) {
      const newScroll = Math.max(0, rowTop - Math.floor(containerHeight / 2));
      containerRef.current.scrollTop = newScroll;
      setScrollTop(newScroll);
    }

    const targetCoord = {
      row: filterMode ? targetVirtualRow : targetPhysicalRow,
      col: targetCol,
    };
    setActiveCell(targetCoord);
    setSelectionAnchor(targetCoord);
    setSelectedRange({
      startRow: targetCoord.row,
      startCol: targetCoord.col,
      endRow: targetCoord.row,
      endCol: targetCoord.col,
    });

    if (onActiveCellChange) {
      const rowData = rowCacheRef.current.get(targetVirtualRow);
      if (rowData && rowData[targetCol] !== undefined) {
        onActiveCellChange(targetCoord, rowData[targetCol]);
      }
    }
  }, [currentSearchMatch, containerHeight, filterMode, filterIndices, setActiveCell, onActiveCellChange]);

  // セル編集開始
  const startEditing = (row: number, col: number, virtualIdx: number, currentValue: string) => {
    setEditingCell({ row, col, virtualIdx, initialValue: currentValue });
    setEditValue(currentValue);
  };

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  // セル編集確定
  const commitEdit = () => {
    if (!editingCell) return;
    const { row, col, virtualIdx, initialValue } = editingCell;
    const valToSave = editValue;

    if (valToSave !== initialValue) {
      const cache = rowCacheRef.current;
      const cachedRow = cache.get(virtualIdx);
      if (cachedRow) {
        const copy = [...cachedRow];
        copy[col] = valToSave;
        cache.set(virtualIdx, copy);
        setCacheVersion((v) => v + 1);
      }

      onCellEdited(row, col, valToSave, initialValue);

      if (onActiveCellChange && activeCell) {
        onActiveCellChange(activeCell, valToSave);
      }
    }
    setEditingCell(null);
  };

  // セル編集キャンセル
  const cancelEdit = () => {
    setEditingCell(null);
  };

  // セルの可視化スクロール追従 (縦スクロール ＋ 横スクロール)
  const ensureCellVisible = useCallback(
    (virtualRow: number, col?: number) => {
      if (!containerRef.current) return;
      const rowTop = virtualRow * ROW_HEIGHT;
      const currentScroll = containerRef.current.scrollTop;
      const headerHeight = 32;

      if (rowTop < currentScroll) {
        containerRef.current.scrollTop = rowTop;
      } else if (rowTop + ROW_HEIGHT > currentScroll + containerHeight - headerHeight) {
        containerRef.current.scrollTop = rowTop + ROW_HEIGHT - (containerHeight - headerHeight);
      }

      if (col !== undefined && columnOffsets[col] !== undefined) {
        const colLeft = columnOffsets[col];
        const colWidth = columnWidths[col] || DEFAULT_COL_WIDTH;
        const colRight = colLeft + colWidth;
        const currentScrollLeft = containerRef.current.scrollLeft;
        const rowNumOffset = ROW_NUM_WIDTH;

        if (colLeft < currentScrollLeft + rowNumOffset) {
          containerRef.current.scrollLeft = Math.max(0, colLeft - rowNumOffset);
        } else if (colRight > currentScrollLeft + containerWidth) {
          containerRef.current.scrollLeft = colRight - containerWidth;
        }
      }
    },
    [containerHeight, containerWidth, columnOffsets, columnWidths]
  );

  // キーボード操作ハンドラ
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (editingCell) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit();
        if (editingCell.row + 1 < effectiveTotalRows) {
          const nextRow = editingCell.row + 1;
          const nextCoord = { row: nextRow, col: editingCell.col };
          setActiveCell(nextCoord);
          setSelectionAnchor(nextCoord);
          setSelectedRange({ startRow: nextRow, startCol: editingCell.col, endRow: nextRow, endCol: editingCell.col });
          ensureCellVisible(nextRow, editingCell.col);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        commitEdit();
        const nextCol = e.shiftKey ? editingCell.col - 1 : editingCell.col + 1;
        if (nextCol >= 0 && nextCol < metadata.totalCols) {
          const nextCoord = { row: editingCell.row, col: nextCol };
          setActiveCell(nextCoord);
          setSelectionAnchor(nextCoord);
          setSelectedRange({ startRow: editingCell.row, startCol: nextCol, endRow: editingCell.row, endCol: nextCol });
          ensureCellVisible(editingCell.row, nextCol);
        }
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        if (onRedo) onRedo();
      } else {
        if (onUndo) onUndo();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      if (onRedo) onRedo();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      handleCopyTsv();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      handlePasteClipboard();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      const allRange: CellRange = {
        startRow: 0,
        startCol: 0,
        endRow: effectiveTotalRows - 1,
        endCol: metadata.totalCols - 1,
      };
      setSelectedRange(allRange);
      return;
    }

    if (!activeCell) return;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (activeCell.row > 0) {
        const nextRow = activeCell.row - 1;
        const nextCoord = { row: nextRow, col: activeCell.col };
        setActiveCell(nextCoord);
        if (e.shiftKey) {
          const anchor = selectionAnchor || activeCell;
          setSelectedRange({ startRow: anchor.row, startCol: anchor.col, endRow: nextRow, endCol: activeCell.col });
        } else {
          setSelectionAnchor(nextCoord);
          setSelectedRange({ startRow: nextRow, startCol: activeCell.col, endRow: nextRow, endCol: activeCell.col });
        }
        ensureCellVisible(nextRow, activeCell.col);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (activeCell.row + 1 < effectiveTotalRows) {
        const nextRow = activeCell.row + 1;
        const nextCoord = { row: nextRow, col: activeCell.col };
        setActiveCell(nextCoord);
        if (e.shiftKey) {
          const anchor = selectionAnchor || activeCell;
          setSelectedRange({ startRow: anchor.row, startCol: anchor.col, endRow: nextRow, endCol: activeCell.col });
        } else {
          setSelectionAnchor(nextCoord);
          setSelectedRange({ startRow: nextRow, startCol: activeCell.col, endRow: nextRow, endCol: activeCell.col });
        }
        ensureCellVisible(nextRow, activeCell.col);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (activeCell.col > 0) {
        const nextCol = activeCell.col - 1;
        const nextCoord = { row: activeCell.row, col: nextCol };
        setActiveCell(nextCoord);
        if (e.shiftKey) {
          const anchor = selectionAnchor || activeCell;
          setSelectedRange({ startRow: anchor.row, startCol: anchor.col, endRow: activeCell.row, endCol: nextCol });
        } else {
          setSelectionAnchor(nextCoord);
          setSelectedRange({ startRow: activeCell.row, startCol: nextCol, endRow: activeCell.row, endCol: nextCol });
        }
        ensureCellVisible(activeCell.row, nextCol);
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (activeCell.col + 1 < metadata.totalCols) {
        const nextCol = activeCell.col + 1;
        const nextCoord = { row: activeCell.row, col: nextCol };
        setActiveCell(nextCoord);
        if (e.shiftKey) {
          const anchor = selectionAnchor || activeCell;
          setSelectedRange({ startRow: anchor.row, startCol: anchor.col, endRow: activeCell.row, endCol: nextCol });
        } else {
          setSelectionAnchor(nextCoord);
          setSelectedRange({ startRow: activeCell.row, startCol: nextCol, endRow: activeCell.row, endCol: nextCol });
        }
        ensureCellVisible(activeCell.row, nextCol);
      }
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      const cachedRow = rowCacheRef.current.get(activeCell.row) || [];
      const cellVal = cachedRow[activeCell.col] || '';
      const physicalRow = filterMode && filterIndices
        ? (filterIndices[activeCell.row] ?? activeCell.row)
        : activeCell.row;
      startEditing(physicalRow, activeCell.col, activeCell.row, cellVal);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      const jump = Math.floor(containerHeight / ROW_HEIGHT);
      const nextRow = Math.min(effectiveTotalRows - 1, activeCell.row + jump);
      const nextCoord = { row: nextRow, col: activeCell.col };
      setActiveCell(nextCoord);
      if (e.shiftKey) {
        const anchor = selectionAnchor || activeCell;
        setSelectedRange({ startRow: anchor.row, startCol: anchor.col, endRow: nextRow, endCol: activeCell.col });
      } else {
        setSelectionAnchor(nextCoord);
        setSelectedRange({ startRow: nextRow, startCol: activeCell.col, endRow: nextRow, endCol: activeCell.col });
      }
      ensureCellVisible(nextRow, activeCell.col);
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      const jump = Math.floor(containerHeight / ROW_HEIGHT);
      const nextRow = Math.max(0, activeCell.row - jump);
      const nextCoord = { row: nextRow, col: activeCell.col };
      setActiveCell(nextCoord);
      if (e.shiftKey) {
        const anchor = selectionAnchor || activeCell;
        setSelectedRange({ startRow: anchor.row, startCol: anchor.col, endRow: nextRow, endCol: activeCell.col });
      } else {
        setSelectionAnchor(nextCoord);
        setSelectedRange({ startRow: nextRow, startCol: activeCell.col, endRow: nextRow, endCol: nextCoord.col });
      }
      ensureCellVisible(nextRow, activeCell.col);
    }
  };

  const totalTableHeight = effectiveTotalRows * ROW_HEIGHT;

  return (
    <div
      id="qu-table-container"
      ref={containerRef}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      onMouseDown={() => {
        if (document.activeElement !== containerRef.current && !editingCell) {
          containerRef.current?.focus();
        }
      }}
      tabIndex={0}
      className="flex-1 bg-white dark:bg-[#0F1115] overflow-auto relative select-none outline-none font-mono text-xs"
    >
      {/* TSVコピー完了フローティングトースト */}
      {copyToast && copyToast.visible && (
        <div
          id="toast-clipboard-copy"
          className="fixed bottom-10 right-4 z-50 flex items-center gap-2 bg-white dark:bg-[#1A1D23] text-gray-900 dark:text-gray-100 border border-blue-500 rounded-md px-3.5 py-2 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 text-xs font-mono"
        >
          <div className="p-1 bg-blue-600 rounded text-white">
            <Copy className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold">{copyToast.message}</span>
        </div>
      )}

      <div
        style={{
          height: `${totalTableHeight + 36}px`,
          width: `${totalTableWidth}px`,
          position: 'relative',
        }}
      >
        {/* スティッキーヘッダーコンポーネント */}
        <TableHeader
          totalTableWidth={totalTableWidth}
          renderStartCol={renderStartCol}
          renderEndCol={renderEndCol}
          headers={metadata.headers}
          columnWidths={columnWidths}
          columnOffsets={columnOffsets}
          sortConfig={sortConfig}
          hasHeader={hasHeader}
          activeCell={activeCell}
          onSortColumn={onSortColumn}
          onContextMenu={setContextMenuTarget}
          handleMouseDownResize={handleMouseDownResize}
          handleAutoFitColumn={handleAutoFitColumn}
        />

        {/* 仮想レンダリング行の描画 */}
        {Array.from({ length: renderRowCount }, (_, i) => {
          const virtualRowIdx = renderStartRow + i;
          if (virtualRowIdx >= effectiveTotalRows) return null;
          const rowCells = rowCacheRef.current.get(virtualRowIdx) || [];

          return (
            <TableRow
              key={`${hasHeader ? 'hdr' : 'nohdr'}-${virtualRowIdx}`}
              virtualRowIdx={virtualRowIdx}
              effectiveTotalRows={effectiveTotalRows}
              filterMode={filterMode}
              filterIndices={filterIndices}
              totalTableWidth={totalTableWidth}
              rowCells={rowCells}
              renderStartCol={renderStartCol}
              renderEndCol={renderEndCol}
              columnWidths={columnWidths}
              columnOffsets={columnOffsets}
              isRowSelected={isRowSelected}
              isCellInRange={isCellInRange}
              activeCell={activeCell}
              selectionAnchor={selectionAnchor}
              editingCell={editingCell}
              editValue={editValue}
              editInputRef={editInputRef}
              modifiedCells={modifiedCells}
              currentSearchMatch={currentSearchMatch}
              searchQuery={searchQuery}
              searchCaseSensitive={searchCaseSensitive}
              searchUseRegex={searchUseRegex}
              totalCols={metadata.totalCols}
              hasHeader={hasHeader}
              containerRef={containerRef}
              setEditValue={setEditValue}
              commitEdit={commitEdit}
              startEditing={startEditing}
              setActiveCell={setActiveCell}
              setSelectionAnchor={setSelectionAnchor}
              setSelectedRange={setSelectedRange}
              setIsSelecting={setIsSelecting}
              isSelecting={isSelecting}
              onActiveCellChange={onActiveCellChange}
              setContextMenuTarget={setContextMenuTarget}
            />
          );
        })}
      </div>

      {/* 行・列コンテキストメニュー */}
      {contextMenuTarget && (
        <TableContextMenu
          target={contextMenuTarget}
          onClose={() => setContextMenuTarget(null)}
          onCopy={handleCopyTsv}
          onInsertRowAbove={(r) => onInsertRow && onInsertRow(r)}
          onInsertRowBelow={(r) => onInsertRow && onInsertRow(r + 1)}
          onDuplicateRow={(r) => onDuplicateRow && onDuplicateRow(r)}
          onDeleteRow={(r) => onDeleteRow && onDeleteRow(r)}
          onInsertColLeft={(c) => onInsertCol && onInsertCol(c)}
          onInsertColRight={(c) => onInsertCol && onInsertCol(c + 1)}
          onDuplicateCol={(c) => onDuplicateCol && onDuplicateCol(c)}
          onDeleteCol={(c) => onDeleteCol && onDeleteCol(c)}
        />
      )}
    </div>
  );
};
