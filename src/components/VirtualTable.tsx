// UPDATE 2026-08-26: [未保存編集セルの視覚的色分け & 右クリックコンテキストメニュー & Undo/Redo連携]
// なぜ: 行・列の追加/複製/削除メニュー、未保存セルの強調表示、およびテーブル上でのUndo/Redoショートカットに対応するため。
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  FileMetadata,
  CellCoordinate,
  CellRange,
  SearchMatch,
  SortConfig,
} from '../types/csv';
import { TauriBridge } from '../services/tauriBridge';
import { ArrowUpDown, ArrowUp, ArrowDown, Copy } from 'lucide-react';
import { TableContextMenu, ContextMenuTarget } from './TableContextMenu';

interface VirtualTableProps {
  metadata: FileMetadata;
  hasHeader?: boolean;
  activeCell: CellCoordinate | null;
  setActiveCell: (coord: CellCoordinate | null) => void;
  onActiveCellChange?: (coord: CellCoordinate | null, value: string) => void;
  currentSearchMatch: SearchMatch | null;
  sortConfig: SortConfig;
  onSortColumn: (colIndex: number) => void;
  onCellEdited: (row: number, col: number, value: string) => void;
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

const ROW_HEIGHT = 30; // 1行あたりの固定高さ (px)
const BUFFER_ROWS = 15; // スクロール前後のバッファ行数
const DEFAULT_COL_WIDTH = 160;
const MIN_COL_WIDTH = 60;

// UPDATE 2026-08-26: [ライト/ダーク両対応ハイライトレンダラー]
// なぜ: 無効な light: 構文を除去し、ライトモードとダークモードで視認性の高いキーワードハイライトを提供するため
function renderHighlightedText(
  text: string,
  query?: string,
  caseSensitive: boolean = false,
  useRegex: boolean = false
): React.ReactNode {
  if (!query || query.trim() === '' || !text) {
    return text;
  }

  if (useRegex) {
    try {
      const regex = new RegExp(`(${query})`, caseSensitive ? 'g' : 'gi');
      const parts = text.split(regex);
      if (parts.length <= 1) return text;

      const testRegex = new RegExp(`^${query}$`, caseSensitive ? '' : 'i');
      return parts.map((part, idx) => {
        if (part && testRegex.test(part)) {
          return (
            <mark
              key={idx}
              className="bg-yellow-300 dark:bg-amber-400 text-gray-950 px-0.5 rounded-xs shadow-xs select-text font-semibold"
            >
              {part}
            </mark>
          );
        }
        return part;
      });
    } catch {
      return text;
    }
  }

  const querySearch = caseSensitive ? query : query.toLowerCase();
  const textSearch = caseSensitive ? text : text.toLowerCase();

  if (!textSearch.includes(querySearch)) {
    return text;
  }

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  const qLen = query.length;

  while (lastIndex < text.length) {
    const matchIndex = textSearch.indexOf(querySearch, lastIndex);
    if (matchIndex === -1) {
      nodes.push(text.slice(lastIndex));
      break;
    }

    if (matchIndex > lastIndex) {
      nodes.push(text.slice(lastIndex, matchIndex));
    }

    nodes.push(
      <mark
        key={matchIndex}
        className="bg-yellow-300 dark:bg-amber-400 text-gray-950 px-0.5 rounded-xs shadow-xs select-text font-semibold"
      >
        {text.slice(matchIndex, matchIndex + qLen)}
      </mark>
    );

    lastIndex = matchIndex + qLen;
  }

  return nodes;
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
  const [containerHeight, setContainerHeight] = useState(600);
  const [visibleRows, setVisibleRows] = useState<string[][]>([]);
  const [originalRowIndices, setOriginalRowIndices] = useState<number[]>([]);
  const [sliceStartRow, setSliceStartRow] = useState(0);
  const [columnWidths, setColumnWidths] = useState<number[]>([]);
  
  // セル範囲選択ステート
  const [selectedRange, setSelectedRange] = useState<CellRange | null>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<CellCoordinate | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [copyToast, setCopyToast] = useState<{ message: string; visible: boolean } | null>(null);
  const [contextMenuTarget, setContextMenuTarget] = useState<ContextMenuTarget | null>(null);

  // セル直接編集ステート (物理行番号, 列番号, スライス内行インデックス, 初期値)
  const [editingCell, setEditingCell] = useState<{
    row: number;
    col: number;
    sliceIdx: number;
    initialValue: string;
  } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // カラム幅リサイズ用
  const resizingColRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  // ドラッグ選択終了の監視
  useEffect(() => {
    const handleMouseUp = () => {
      setIsSelecting(false);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // 有効な行総数 (フィルタモード時はフィルタ該当件数)
  const effectiveTotalRows = useMemo(() => {
    if (filterMode && filterIndices) {
      return filterIndices.length;
    }
    return metadata.totalRows;
  }, [filterMode, filterIndices, metadata.totalRows]);

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

  // UPDATE 2026-08-21: [選択セル範囲のクリップボードTSVコピー (Ctrl+C)]
  // なぜ: 表計算ソフトやテキストエディタと親和性の高いTSV形式で選択範囲を瞬時にクリップボードへ保存するため
  const handleCopyTsv = useCallback(async () => {
    if (!metadata) return;

    let minRow = 0;
    let maxRow = 0;
    let minCol = 0;
    let maxCol = 0;

    if (selectedRange) {
      minRow = Math.min(selectedRange.startRow, selectedRange.endRow);
      maxRow = Math.max(selectedRange.startRow, selectedRange.endRow);
      minCol = Math.min(selectedRange.startCol, selectedRange.endCol);
      maxCol = Math.max(selectedRange.startCol, selectedRange.endCol);
    } else if (activeCell) {
      minRow = activeCell.row;
      maxRow = activeCell.row;
      minCol = activeCell.col;
      maxCol = activeCell.col;
    } else {
      return;
    }

    try {
      const { tsvText, rowCount, colCount } = await TauriBridge.getRangeTsv(
        minRow,
        maxRow,
        minCol,
        maxCol,
        filterIndices || undefined,
        sortConfig
      );

      await navigator.clipboard.writeText(tsvText);

      const msg =
        rowCount === 1 && colCount === 1
          ? `クリップボードにコピーしました (1 セル)`
          : `TSVコピー完了: ${rowCount.toLocaleString()} 行 × ${colCount} 列 (${(rowCount * colCount).toLocaleString()} セル)`;

      setCopyToast({ message: msg, visible: true });

      setTimeout(() => {
        setCopyToast((prev) => (prev ? { ...prev, visible: false } : null));
      }, 2400);
    } catch (err) {
      console.error('Failed to copy TSV to clipboard:', err);
    }
  }, [metadata, selectedRange, activeCell, filterIndices, sortConfig]);

  // 初期列幅の設定
  useEffect(() => {
    if (metadata.headers.length > 0) {
      setColumnWidths((prev) => {
        if (prev.length === metadata.headers.length) return prev;
        return metadata.headers.map(() => DEFAULT_COL_WIDTH);
      });
    }
  }, [metadata.headers]);

  // コンテナのリサイズ監視
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 仮想表示範囲の計算
  const { startRow, endRow, rowCount } = useMemo(() => {
    const total = effectiveTotalRows;
    const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT);
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
    const end = Math.min(total, start + visibleCount + BUFFER_ROWS * 2);
    return {
      startRow: start,
      endRow: end,
      rowCount: Math.max(0, end - start),
    };
  }, [scrollTop, containerHeight, effectiveTotalRows]);

  // 画面枠内スライスの取得
  const fetchSlice = useCallback(
    async (
      start: number,
      count: number,
      fIndices?: number[] | null,
      currentSort?: SortConfig
    ) => {
      if (count <= 0) {
        setVisibleRows([]);
        setOriginalRowIndices([]);
        return;
      }
      try {
        const response = await TauriBridge.getSlice(
          start,
          count,
          fIndices || undefined,
          currentSort || undefined
        );
        setVisibleRows(response.rows);
        setSliceStartRow(response.startRow);
        const origIndices =
          response.originalRowIndices || response.rows.map((_, i) => response.startRow + i);
        setOriginalRowIndices(origIndices);
      } catch (err) {
        console.error('Failed to fetch slice:', err);
      }
    },
    []
  );

  // スライス取得のトリガー
  useEffect(() => {
    const activeFilter = filterMode && filterIndices ? filterIndices : null;
    fetchSlice(startRow, rowCount, activeFilter, sortConfig);
  }, [
    startRow,
    rowCount,
    fetchSlice,
    metadata.isDirty,
    metadata.totalRows,
    metadata.headers,
    filterMode,
    filterIndices,
    sortConfig,
  ]);

  // visibleRows や activeCell が変更された際に、現在選択されているセルの値を親へ同期
  useEffect(() => {
    if (!activeCell || !onActiveCellChange) return;

    const sliceIdx = activeCell.row - sliceStartRow;
    if (sliceIdx >= 0 && sliceIdx < visibleRows.length && visibleRows[sliceIdx]) {
      const cellVal = visibleRows[sliceIdx][activeCell.col] ?? '';
      onActiveCellChange(activeCell, cellVal);
    }
  }, [visibleRows, activeCell, sliceStartRow, onActiveCellChange]);

  // スクロールイベント
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  // 外部からのジャンプ
  useEffect(() => {
    if (jumpToRowTrigger !== null && containerRef.current) {
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
    }
  }, [jumpToRowTrigger, containerHeight, filterMode, filterIndices, setActiveCell, metadata.totalCols]);

  // 検索ヒット位置への自動スクロール＆アクティブセル同期
  useEffect(() => {
    if (currentSearchMatch && containerRef.current) {
      const { row: targetPhysicalRow, col: targetCol } = currentSearchMatch;
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
        containerRef.current.scrollTop = Math.max(
          0,
          rowTop - Math.floor(containerHeight / 2)
        );
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
        const rowInSlice = targetVirtualRow - sliceStartRow;
        if (visibleRows[rowInSlice] && visibleRows[rowInSlice][targetCol] !== undefined) {
          onActiveCellChange(targetCoord, visibleRows[rowInSlice][targetCol]);
        }
      }
    }
  }, [
    currentSearchMatch,
    containerHeight,
    filterMode,
    filterIndices,
    setActiveCell,
    onActiveCellChange,
    sliceStartRow,
    visibleRows,
  ]);

  // セル編集開始
  const startEditing = (row: number, col: number, sliceIdx: number, currentValue: string) => {
    setEditingCell({ row, col, sliceIdx, initialValue: currentValue });
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
    const { row, col, sliceIdx, initialValue } = editingCell;
    const valToSave = editValue;

    if (valToSave !== initialValue) {
      setVisibleRows((prev) => {
        const next = [...prev];
        if (next[sliceIdx]) {
          const rowCopy = [...next[sliceIdx]];
          rowCopy[col] = valToSave;
          next[sliceIdx] = rowCopy;
        }
        return next;
      });

      onCellEdited(row, col, valToSave);

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

  // カラム幅リサイズ処理
  const handleMouseDownResize = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingColRef.current = {
      index,
      startX: e.clientX,
      startWidth: columnWidths[index] || DEFAULT_COL_WIDTH,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingColRef.current) return;
      const { index, startX, startWidth } = resizingColRef.current;
      const diff = moveEvent.clientX - startX;
      const newWidth = Math.max(MIN_COL_WIDTH, startWidth + diff);
      setColumnWidths((prev) => {
        const next = [...prev];
        next[index] = newWidth;
        return next;
      });
    };

    const handleMouseUp = () => {
      resizingColRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

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
        }
      }
      return;
    }

    // UPDATE 2026-08-26: [Ctrl+Z / Ctrl+Y Undo / Redo & Ctrl+C コピー & Ctrl+A 全選択]
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
        ensureCellVisible(nextRow);
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
        ensureCellVisible(nextRow);
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
      }
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      const rowInSlice = activeCell.row - sliceStartRow;
      const cellVal = (visibleRows[rowInSlice] && visibleRows[rowInSlice][activeCell.col]) || '';
      const physicalRow = originalRowIndices[rowInSlice] ?? activeCell.row;
      startEditing(physicalRow, activeCell.col, rowInSlice, cellVal);
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
      ensureCellVisible(nextRow);
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
      ensureCellVisible(nextRow);
    }
  };

  const ensureCellVisible = (virtualRow: number) => {
    if (!containerRef.current) return;
    const rowTop = virtualRow * ROW_HEIGHT;
    const currentScroll = containerRef.current.scrollTop;
    const headerHeight = 32;

    if (rowTop < currentScroll) {
      containerRef.current.scrollTop = rowTop;
    } else if (rowTop + ROW_HEIGHT > currentScroll + containerHeight - headerHeight) {
      containerRef.current.scrollTop = rowTop + ROW_HEIGHT - (containerHeight - headerHeight);
    }
  };

  const totalTableHeight = effectiveTotalRows * ROW_HEIGHT;
  const totalTableWidth = useMemo(() => {
    return columnWidths.reduce((acc, w) => acc + w, 68); // 68px for fixed row index column
  }, [columnWidths]);

// UPDATE 2026-08-26: [ライト/ダーク両対応テーブルレンダリング]
// なぜ: 無効な light: 構文を除去し、ライトモード（デフォルト）と dark: バリアントによるスタイリングを完全適用するため
  return (
    <div
      id="qu-table-container"
      ref={containerRef}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
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
        {/* スティッキーヘッダー */}
        <div
          id="qu-sticky-header"
          className="sticky top-0 z-30 flex bg-[#E5E7EB] dark:bg-[#1A1D23] border-b border-gray-300 dark:border-[#2D3139] text-gray-800 dark:text-[#D1D5DB] font-semibold h-8 text-[11px] shadow-xs"
          style={{ width: `${totalTableWidth}px` }}
        >
          {/* 行番号ヘッダーセル */}
          <div
            className="w-[68px] min-w-[68px] sticky left-0 z-40 bg-[#E5E7EB] dark:bg-[#16191E] border-r border-gray-300 dark:border-[#2D3139] flex items-center justify-center text-gray-600 dark:text-gray-400 text-[10px] font-bold shadow-[2px_0_4px_rgba(0,0,0,0.06)] select-none"
            title="物理行番号 (Physical Line #)"
          >
            # (行)
          </div>

          {/* 各カラムヘッダー */}
          {metadata.headers.map((header, colIdx) => {
            const width = columnWidths[colIdx] || DEFAULT_COL_WIDTH;
            const isSorted = sortConfig.column === colIdx;
            const isNullHeader = !hasHeader || header === 'NULL';

            return (
              <div
                key={colIdx}
                id={`header-col-${colIdx}`}
                style={{ width: `${width}px`, minWidth: `${width}px` }}
                className="relative flex items-center justify-between px-3 bg-[#E5E7EB] dark:bg-[#1A1D23] hover:bg-gray-200 dark:hover:bg-[#242A35] border-r border-gray-300 dark:border-[#2D3139] transition-colors group cursor-pointer"
                onClick={() => onSortColumn(colIdx)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenuTarget({
                    type: 'col',
                    rowIndex: activeCell ? activeCell.row : 0,
                    colIndex: colIdx,
                    x: e.clientX,
                    y: e.clientY,
                  });
                }}
                title={isNullHeader ? `列 ${colIdx + 1} (ヘッダーなし - NULL) (右クリックで列操作)` : `クリックでソート: ${header} (右クリックで列操作)`}
              >
                {isNullHeader ? (
                  <span className="truncate text-gray-400 dark:text-gray-500 font-mono italic font-semibold select-none">
                    NULL
                  </span>
                ) : (
                  <span className="truncate text-gray-900 dark:text-gray-200 font-medium">{header}</span>
                )}

                <div className="flex items-center text-gray-600 dark:text-gray-400 ml-1">
                  {isSorted ? (
                    sortConfig.direction === 'asc' ? (
                      <ArrowUp className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                  )}
                </div>

                {/* カラム幅リサイズハンドル */}
                <div
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500 z-10"
                  onMouseDown={(e) => handleMouseDownResize(colIdx, e)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            );
          })}
        </div>

        {/* 仮想レンダリング行の描画枠 */}
        <div
          style={{
            transform: `translateY(${sliceStartRow * ROW_HEIGHT}px)`,
            position: 'absolute',
            top: '32px',
            left: 0,
            width: `${totalTableWidth}px`,
          }}
        >
          {visibleRows.map((rowCells, sliceIdx) => {
            const virtualRowIdx = sliceStartRow + sliceIdx;
            if (virtualRowIdx >= effectiveTotalRows) return null;

            const physicalRowIdx = originalRowIndices[sliceIdx] !== undefined
              ? originalRowIndices[sliceIdx]
              : virtualRowIdx;
            const displayRowNumber = physicalRowIdx + 1;
            const targetRowIndex = filterMode ? virtualRowIdx : physicalRowIdx;
            const thisRowSelected = isRowSelected(targetRowIndex);

            return (
              <div
                key={virtualRowIdx}
                id={`row-${virtualRowIdx}`}
                style={{ height: `${ROW_HEIGHT}px` }}
                className={`flex border-b transition-colors ${
                  thisRowSelected
                    ? 'bg-blue-100/80 dark:bg-blue-950/40 border-blue-300 dark:border-[#2563EB]/50'
                    : virtualRowIdx % 2 === 0
                    ? 'bg-white dark:bg-[#0F1115] border-gray-200 dark:border-[#1E232B]'
                    : 'bg-gray-50/70 dark:bg-[#13161C] border-gray-200 dark:border-[#1E232B]'
                } hover:bg-blue-50/80 dark:hover:bg-[#1A202C]`}
              >
                {/* 行番号セル */}
                <div
                  id={`row-num-${virtualRowIdx}`}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    if (e.button !== 0) return;
                    if (e.shiftKey && (selectionAnchor || activeCell)) {
                      const anchor = selectionAnchor || activeCell!;
                      setSelectedRange({
                        startRow: anchor.row,
                        startCol: 0,
                        endRow: targetRowIndex,
                        endCol: metadata.totalCols - 1,
                      });
                      setActiveCell({ row: targetRowIndex, col: 0 });
                    } else {
                      const nextCoord = { row: targetRowIndex, col: 0 };
                      setActiveCell(nextCoord);
                      setSelectionAnchor(nextCoord);
                      setSelectedRange({
                        startRow: targetRowIndex,
                        startCol: 0,
                        endRow: targetRowIndex,
                        endCol: metadata.totalCols - 1,
                      });
                    }
                    if (onActiveCellChange) {
                      const firstVal = rowCells[0] ?? '';
                      onActiveCellChange({ row: targetRowIndex, col: 0 }, firstVal);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenuTarget({
                      type: 'row',
                      rowIndex: physicalRowIdx,
                      colIndex: activeCell ? activeCell.col : 0,
                      x: e.clientX,
                      y: e.clientY,
                    });
                  }}
                  className={`w-[68px] min-w-[68px] sticky left-0 z-20 flex items-center justify-end px-2 text-[10px] select-none tracking-tighter cursor-pointer transition-colors ${
                    thisRowSelected
                      ? 'bg-blue-600 text-white font-bold border-r-2 border-r-blue-700 dark:border-r-blue-400 shadow-[2px_0_6px_rgba(37,99,235,0.3)]'
                      : 'bg-[#F3F4F6] dark:bg-[#16191E] border-r border-gray-300 dark:border-[#2D3139] text-gray-600 dark:text-gray-500 font-semibold shadow-[2px_0_4px_rgba(0,0,0,0.06)] hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300'
                  }`}
                  title={`物理行: ${displayRowNumber.toLocaleString()} 行目 (クリックで行を選択, 右クリックで行操作)`}
                >
                  {displayRowNumber.toLocaleString()}
                </div>

                {/* 各セル */}
                {metadata.headers.map((_, colIdx) => {
                  const width = columnWidths[colIdx] || DEFAULT_COL_WIDTH;
                  const cellValue = rowCells[colIdx] ?? '';
                  const isActive =
                    activeCell?.row === targetRowIndex &&
                    activeCell?.col === colIdx;
                  const inRange = isCellInRange(targetRowIndex, colIdx);
                  const isEditing =
                    editingCell?.row === physicalRowIdx && editingCell?.col === colIdx;
                  const isCurrentSearchMatch =
                    currentSearchMatch?.row === physicalRowIdx &&
                    currentSearchMatch?.col === colIdx;
                  const isModified = modifiedCells
                    ? modifiedCells.has(`${physicalRowIdx},${colIdx}`)
                    : false;
                  
                  let hasKeywordMatch = false;
                  if (searchQuery.trim().length > 0) {
                    if (searchUseRegex) {
                      try {
                        const r = new RegExp(searchQuery, searchCaseSensitive ? '' : 'i');
                        hasKeywordMatch = r.test(cellValue);
                      } catch {
                        hasKeywordMatch = false;
                      }
                    } else {
                      hasKeywordMatch = searchCaseSensitive
                        ? cellValue.includes(searchQuery)
                        : cellValue.toLowerCase().includes(searchQuery.toLowerCase());
                    }
                  }

                  return (
                    <div
                      key={colIdx}
                      id={`cell-${virtualRowIdx}-${colIdx}`}
                      style={{ width: `${width}px`, minWidth: `${width}px` }}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        if (e.shiftKey && activeCell) {
                          const anchor = selectionAnchor || activeCell;
                          setSelectedRange({
                            startRow: anchor.row,
                            startCol: anchor.col,
                            endRow: targetRowIndex,
                            endCol: colIdx,
                          });
                          setActiveCell({ row: targetRowIndex, col: colIdx });
                        } else {
                          const nextCoord = { row: targetRowIndex, col: colIdx };
                          setActiveCell(nextCoord);
                          setSelectionAnchor(nextCoord);
                          setSelectedRange({
                            startRow: targetRowIndex,
                            startCol: colIdx,
                            endRow: targetRowIndex,
                            endCol: colIdx,
                          });
                          setIsSelecting(true);
                        }
                        if (onActiveCellChange) {
                          onActiveCellChange({ row: targetRowIndex, col: colIdx }, cellValue);
                        }
                      }}
                      onMouseEnter={() => {
                        if (isSelecting && selectionAnchor) {
                          setSelectedRange({
                            startRow: selectionAnchor.row,
                            startCol: selectionAnchor.col,
                            endRow: targetRowIndex,
                            endCol: colIdx,
                          });
                          setActiveCell({ row: targetRowIndex, col: colIdx });
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenuTarget({
                          type: 'cell',
                          rowIndex: physicalRowIdx,
                          colIndex: colIdx,
                          x: e.clientX,
                          y: e.clientY,
                        });
                      }}
                      onDoubleClick={() => startEditing(physicalRowIdx, colIdx, sliceIdx, cellValue)}
                      title={isModified ? `未保存の編集セル (保存するまで強調表示): "${cellValue}" (右クリックで行・列操作)` : undefined}
                      className={`relative px-2.5 flex items-center border-r border-gray-200 dark:border-[#1E232B] truncate cursor-cell transition-colors ${
                        isActive
                          ? isModified
                            ? 'ring-2 ring-blue-500 bg-amber-200/95 dark:bg-amber-900/70 z-10 text-amber-950 dark:text-amber-100 font-bold border-l-2 border-l-amber-500'
                            : 'ring-2 ring-blue-500 bg-blue-200/95 dark:bg-blue-900/60 z-10 text-blue-950 dark:text-white font-semibold'
                          : isModified
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 border-l-2 border-l-amber-500 font-semibold shadow-xs'
                          : inRange
                          ? 'bg-blue-100/70 dark:bg-blue-600/30 border-blue-400/40 text-blue-900 dark:text-blue-100'
                          : thisRowSelected
                          ? 'text-blue-950 dark:text-gray-100'
                          : 'text-gray-800 dark:text-gray-300'
                      } ${
                        isCurrentSearchMatch
                          ? 'bg-amber-200/90 dark:bg-amber-500/25 ring-2 ring-amber-500 dark:ring-amber-400 z-10 shadow-xs'
                          : hasKeywordMatch
                          ? 'bg-yellow-100 dark:bg-amber-500/15'
                          : ''
                      }`}
                    >
                      {/* 未保存編集セル右上三角マーカー */}
                      {isModified && !isEditing && (
                        <span
                          className="absolute top-0 right-0 w-2.5 h-2.5 overflow-hidden pointer-events-none z-10"
                          title="未保存の編集セル"
                        >
                          <span className="absolute top-0 right-0 w-0 h-0 border-t-[7px] border-r-[7px] border-t-amber-500 border-r-amber-500 border-b-transparent border-l-transparent" />
                        </span>
                      )}

                      {isEditing ? (
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          className="absolute inset-0 w-full h-full bg-white dark:bg-[#0F1115] text-gray-900 dark:text-white font-mono text-xs px-2.5 border-2 border-blue-500 focus:outline-none z-20"
                        />
                      ) : (
                        <span className="truncate select-text">
                          {renderHighlightedText(cellValue, searchQuery, searchCaseSensitive, searchUseRegex)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* 行・列コンテキストメニュー */}
      {contextMenuTarget && (
        <TableContextMenu
          target={contextMenuTarget}
          onClose={() => setContextMenuTarget(null)}
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
