// UPDATE 2026-08-26: [未保存編集セルの視覚的色分け & 右クリックコンテキストメニュー & Undo/Redo連携]
// なぜ: 行・列の追加/複製/削除メニュー、未保存セルの強調表示、およびテーブル上でのUndo/Redoショートカットに対応するため。
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
import { ArrowUpDown, ArrowUp, ArrowDown, Copy, Check } from 'lucide-react';
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

// UPDATE 2026-09-02: [2次元仮想スクロール（行＋カラム仮想化）]
// なぜ: 210列等の多列CSVで全列DOM生成による2万超の要素数爆発・1秒フリーズを解消し、可視範囲＋予備列のみ描画で瞬時応答を実現するため。
const ROW_HEIGHT = 30; // 1行あたりの固定高さ (px)
const ROW_NUM_WIDTH = 68; // 行番号列の固定幅 (px)
const OVERSCAN_ROWS = 15; // 縦方向の予備描画行数 (上下15行 = 約450px)
const OVERSCAN_COLS = 3; // 横方向の予備描画列数 (左右3列)
const CHUNK_SIZE = 2000; // 1回のIPCで取得するチャンク行数 (2,000行ブロック)
const MAX_CACHED_ROWS = 100000; // メモリ保持する最大行数 (10万行 = 約10MB〜20MBの快適メモリ展開)
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
              className="bg-yellow-300 dark:bg-amber-400 text-gray-950 px-0.5 rounded-xs shadow-xs select-none font-semibold"
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
        className="bg-yellow-300 dark:bg-amber-400 text-gray-950 px-0.5 rounded-xs shadow-xs select-none font-semibold"
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
  const [columnWidths, setColumnWidths] = useState<number[]>([]);
  
  // セル範囲選択ステート
  const [selectedRange, setSelectedRange] = useState<CellRange | null>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<CellCoordinate | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [copyToast, setCopyToast] = useState<{ message: string; visible: boolean } | null>(null);
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

  // カラム幅リサイズ用
  const resizingColRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  // 検索ヒット位置・外部ジャンプの重複発火防止用
  const lastSearchMatchRef = useRef<{ row: number; col: number } | null>(null);
  const lastJumpRowRef = useRef<number | null>(null);

  // 広域チャンクキャッシュ＆同期レンダリング用 Refs
  const requestIdRef = useRef<number>(0);
  const rowCacheRef = useRef<Map<number, string[]>>(new Map());
  const fetchingChunksRef = useRef<Set<number>>(new Set());
  const scrollDirectionRef = useRef<'down' | 'up'>('down');
  const lastScrollTopRef = useRef<number>(0);
  const [, setCacheVersion] = useState<number>(0);

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

  // 有効な行総数 (フィルタモード時はフィルタ該当件数)
  const effectiveTotalRows = useMemo(() => {
    if (filterMode && filterIndices) {
      return filterIndices.length;
    }
    return metadata.totalRows;
  }, [filterMode, filterIndices, metadata.totalRows]);

  // TSVセルエスケープ処理（タブ・改行・クォート対応）
  const formatTsvField = useCallback((val: string): string => {
    if (val.includes('\t') || val.includes('\n') || val.includes('\r') || val.includes('"')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  }, []);

  // 確実なクリップボード書き込みユーティリティ (Navigator API + execCommand フォールバック)
  const safeWriteClipboard = useCallback(async (text: string): Promise<boolean> => {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.warn('navigator.clipboard.writeText failed, falling back to textarea execCommand:', err);
      }
    }

    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      textArea.setAttribute('readonly', '');
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success;
    } catch (err) {
      console.error('Failed to copy text using execCommand:', err);
      return false;
    }
  }, []);

  // TSVコピー処理 (ローカルキャッシュ即時生成 ＋ Rustバックエンドフォールバック)
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

    const rowCount = maxRow - minRow + 1;
    const colCount = maxCol - minCol + 1;

    try {
      const cache = rowCacheRef.current;
      let allCached = true;
      for (let r = minRow; r <= maxRow; r++) {
        if (!cache.has(r)) {
          allCached = false;
          break;
        }
      }

      let tsvText = '';
      if (allCached) {
        const lines: string[] = [];
        for (let r = minRow; r <= maxRow; r++) {
          const rowData = cache.get(r) || [];
          const lineCells: string[] = [];
          for (let c = minCol; c <= maxCol; c++) {
            lineCells.push(formatTsvField(rowData[c] ?? ''));
          }
          lines.push(lineCells.join('\t'));
        }
        tsvText = lines.join('\n');
      } else {
        const result = await TauriBridge.getRangeTsv(
          minRow,
          maxRow,
          minCol,
          maxCol,
          filterIndices || undefined,
          sortConfig
        );
        tsvText = result.tsvText;
      }

      const copySuccess = await safeWriteClipboard(tsvText);

      if (copySuccess) {
        const msg =
          rowCount === 1 && colCount === 1
            ? `クリップボードにコピーしました (1 セル)`
            : `TSVコピー完了: ${rowCount.toLocaleString()} 行 × ${colCount.toLocaleString()} 列 (${(rowCount * colCount).toLocaleString()} セル)`;

        setCopyToast({ message: msg, visible: true });

        setTimeout(() => {
          setCopyToast((prev) => (prev ? { ...prev, visible: false } : null));
        }, 2400);
      }
    } catch (err) {
      console.error('Failed to copy TSV to clipboard:', err);
    }
  }, [metadata, selectedRange, activeCell, filterIndices, sortConfig, formatTsvField, safeWriteClipboard]);

  // グローバル copy イベントの捕捉
  useEffect(() => {
    const handleDocumentCopy = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      if (selectedRange || activeCell) {
        e.preventDefault();
        handleCopyTsv();
      }
    };

    document.addEventListener('copy', handleDocumentCopy);
    return () => document.removeEventListener('copy', handleDocumentCopy);
  }, [selectedRange, activeCell, handleCopyTsv]);

  // 列幅自動調整 (Auto-Fit Column Width)
  const handleAutoFitColumn = useCallback((colIdx: number) => {
    if (!metadata) return;
    const headerText = metadata.headers[colIdx] || '';
    let maxLen = 0;

    let headerWeight = 0;
    for (const char of headerText) {
      headerWeight += char.charCodeAt(0) > 127 ? 2 : 1;
    }
    maxLen = Math.max(maxLen, headerWeight);

    // キャッシュされている全行からセル文字列長を走査
    rowCacheRef.current.forEach((row) => {
      const cellVal = row[colIdx] || '';
      let cellWeight = 0;
      for (const char of cellVal) {
        cellWeight += char.charCodeAt(0) > 127 ? 2 : 1;
      }
      maxLen = Math.max(maxLen, cellWeight);
    });

    const optimalWidth = Math.max(MIN_COL_WIDTH, Math.min(600, Math.ceil(maxLen * 8.5) + 36));
    setColumnWidths((prev) => {
      const next = [...prev];
      next[colIdx] = optimalWidth;
      return next;
    });
  }, [metadata]);

  // クリップボードからの矩形貼り付け
  const handlePasteClipboard = useCallback(async () => {
    if (!metadata || !activeCell || editingCell) return;
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText) return;

      const rawLines = clipboardText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
        rawLines.pop();
      }
      if (rawLines.length === 0) return;

      const startRow = activeCell.row;
      const startCol = activeCell.col;
      const changes: Array<{ row: number; col: number; prevValue: string; newValue: string }> = [];

      for (let r = 0; r < rawLines.length; r++) {
        const line = rawLines[r];
        const targetVirtualRow = startRow + r;
        if (targetVirtualRow >= effectiveTotalRows) break;

        const cells = line.includes('\t') ? line.split('\t') : line.split(',');

        const targetPhysicalRow = filterMode && filterIndices
          ? (filterIndices[targetVirtualRow] ?? targetVirtualRow)
          : targetVirtualRow;

        const cachedRow = rowCacheRef.current.get(targetVirtualRow) || [];

        for (let c = 0; c < cells.length; c++) {
          const targetCol = startCol + c;
          if (targetCol >= metadata.totalCols) break;

          let val = cells[c];
          if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
            val = val.slice(1, -1).replace(/""/g, '"');
          }

          const prevVal = cachedRow[targetCol] || '';

          changes.push({
            row: targetPhysicalRow,
            col: targetCol,
            prevValue: prevVal,
            newValue: val,
          });

          // キャッシュも即座に同期更新
          if (cachedRow[targetCol] !== undefined) {
            cachedRow[targetCol] = val;
          }
        }
      }

      if (changes.length > 0 && onBatchCellEdited) {
        onBatchCellEdited(changes);
        setCacheVersion((v) => v + 1);
        const pastedRowCount = rawLines.length;
        const pastedColCount = changes.length > 0 ? Math.ceil(changes.length / pastedRowCount) : 1;
        setCopyToast({
          message: `📋 貼り付け完了: ${pastedRowCount} 行 × ${pastedColCount} 列 (${changes.length} セル)`,
          visible: true,
        });
        setTimeout(() => {
          setCopyToast((prev) => (prev ? { ...prev, visible: false } : null));
        }, 2500);
      }
    } catch (err) {
      console.warn('Failed to read clipboard text for paste:', err);
    }
  }, [metadata, activeCell, editingCell, effectiveTotalRows, filterMode, filterIndices, onBatchCellEdited]);

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

  // 初期列幅の設定
  useEffect(() => {
    if (metadata.headers.length > 0) {
      setColumnWidths((prev) => {
        if (prev.length === metadata.headers.length) return prev;
        return metadata.headers.map(() => DEFAULT_COL_WIDTH);
      });
    }
  }, [metadata.headers]);

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

  // 各列の左端X座標を事前計算 (行番号列 ROW_NUM_WIDTH を含む)
  const columnOffsets = useMemo(() => {
    const offsets: number[] = [];
    let current = ROW_NUM_WIDTH;
    for (let i = 0; i < metadata.headers.length; i++) {
      offsets.push(current);
      current += columnWidths[i] || DEFAULT_COL_WIDTH;
    }
    return offsets;
  }, [metadata.headers.length, columnWidths]);

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

  // フィルタやソート変更時はローカルキャッシュをクリア
  useEffect(() => {
    requestIdRef.current++;
    rowCacheRef.current.clear();
    fetchingChunksRef.current.clear();
    setCacheVersion((v) => v + 1);
  }, [filterMode, filterIndices, sortConfig]);

  // スクロール位置に基づくチャンク取得＆先回りプリフェッチ (進行方向3チャンク = 6,000行先読み)
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
  ]);

  // バックグラウンド順次全行プリフェッチ (Idle Stream Loading: 開いて数秒で全行をメモリに常駐)
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
            setTimeout(idleFetchLoop, 40); // 40ms間隔でバックグラウンド先読み
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

  // スクロールイベントの同期即時反映 (縦スクロール・横スクロール両方を完全同期追従)
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

          {/* 各カラムヘッダー（可視列 renderStartCol 〜 renderEndCol のみ描画） */}
          {Array.from({ length: renderEndCol - renderStartCol }, (_, idx) => {
            const colIdx = renderStartCol + idx;
            const header = metadata.headers[colIdx];
            const width = columnWidths[colIdx] || DEFAULT_COL_WIDTH;
            const left = columnOffsets[colIdx];
            const isSorted = sortConfig.column === colIdx;
            const isHeaderless = !hasHeader || header === 'NULL';
            const displayHeader = isHeaderless ? String(colIdx + 1) : header;

            return (
              <div
                key={colIdx}
                id={`header-col-${colIdx}`}
                style={{
                  position: 'absolute',
                  left: `${left}px`,
                  width: `${width}px`,
                  minWidth: `${width}px`,
                  top: 0,
                  height: '32px',
                }}
                className="flex items-center justify-between px-3 bg-[#E5E7EB] dark:bg-[#1A1D23] hover:bg-gray-200 dark:hover:bg-[#242A35] border-r border-gray-300 dark:border-[#2D3139] transition-colors group cursor-pointer"
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
                title={isHeaderless ? `列 ${colIdx + 1} (タイトル行なし - 列番号: ${colIdx + 1}) (右クリックで列操作)` : `クリックでソート: ${header} (右クリックで列操作)`}
              >
                {isHeaderless ? (
                  <span className="truncate text-gray-700 dark:text-gray-300 font-mono font-bold select-none">
                    {displayHeader}
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

                {/* カラム幅リサイズハンドル（ドラッグで手動リサイズ / ダブルクリックで最適幅自動調整） */}
                <div
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500 z-10"
                  onMouseDown={(e) => handleMouseDownResize(colIdx, e)}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAutoFitColumn(colIdx);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  title="ドラッグで列幅調整 / ダブルクリックで内容幅に自動フィット"
                />
              </div>
            );
          })}
        </div>

        {/* 仮想レンダリング行の描画（各行・各セルを2次元絶対座標配置し、ブラウザの合成スクロールと100%完全同期） */}
        {Array.from({ length: renderRowCount }, (_, i) => {
          const virtualRowIdx = renderStartRow + i;
          if (virtualRowIdx >= effectiveTotalRows) return null;

          const physicalRowIdx = filterMode && filterIndices
            ? (filterIndices[virtualRowIdx] !== undefined ? filterIndices[virtualRowIdx] : virtualRowIdx)
            : virtualRowIdx;
          const displayRowNumber = physicalRowIdx + 1;
          const targetRowIndex = filterMode ? virtualRowIdx : physicalRowIdx;
          const thisRowSelected = isRowSelected(targetRowIndex);

          // ローカル広域チャンクキャッシュから即座に同期取得 (0ms描画)
          const rowCells = rowCacheRef.current.get(virtualRowIdx) || [];

          return (
            <div
              key={`${hasHeader ? 'hdr' : 'nohdr'}-${virtualRowIdx}`}
              id={`row-${virtualRowIdx}`}
              style={{
                position: 'absolute',
                top: `${virtualRowIdx * ROW_HEIGHT + 32}px`,
                left: 0,
                width: `${totalTableWidth}px`,
                height: `${ROW_HEIGHT}px`,
              }}
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
                  e.preventDefault();
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

              {/* 各セル（可視列 renderStartCol 〜 renderEndCol のみ描画） */}
              {Array.from({ length: renderEndCol - renderStartCol }, (_, idx) => {
                const colIdx = renderStartCol + idx;
                const width = columnWidths[colIdx] || DEFAULT_COL_WIDTH;
                const left = columnOffsets[colIdx];
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
                    style={{
                      position: 'absolute',
                      left: `${left}px`,
                      width: `${width}px`,
                      minWidth: `${width}px`,
                      top: 0,
                      height: `${ROW_HEIGHT}px`,
                    }}
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
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
                    onDoubleClick={() => startEditing(physicalRowIdx, colIdx, virtualRowIdx, cellValue)}
                    title={isModified ? `未保存の編集セル (保存するまで強調表示): "${cellValue}" (右クリックで行・列操作)` : undefined}
                    className={`relative px-2.5 flex items-center border-r border-gray-200 dark:border-[#1E232B] truncate cursor-cell select-none transition-colors ${
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
                        className="absolute inset-0 w-full h-full bg-white dark:bg-[#0F1115] text-gray-900 dark:text-white font-mono text-xs px-2.5 border-2 border-blue-500 focus:outline-none z-20 select-text"
                      />
                    ) : (
                      <span className="truncate select-none pointer-events-none">
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

