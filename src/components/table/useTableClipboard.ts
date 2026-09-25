import React, { useState, useEffect, useCallback } from 'react';
import { CellCoordinate, CellRange, FileMetadata, SortConfig } from '../../types/csv';
import { TauriBridge } from '../../services/tauriBridge';

interface UseTableClipboardParams {
  metadata: FileMetadata;
  selectedRange: CellRange | null;
  activeCell: CellCoordinate | null;
  editingCell: { row: number; col: number } | null;
  effectiveTotalRows: number;
  filterMode?: boolean;
  filterIndices?: number[] | null;
  sortConfig: SortConfig;
  rowCacheRef: React.RefObject<Map<number, string[]>>;
  onBatchCellEdited?: (changes: Array<{ row: number; col: number; prevValue: string; newValue: string }>) => void;
  setCacheVersion: React.Dispatch<React.SetStateAction<number>>;
}

export function useTableClipboard({
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
}: UseTableClipboardParams) {
  const [copyToast, setCopyToast] = useState<{ message: string; visible: boolean } | null>(null);

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
      if (cache) {
        for (let r = minRow; r <= maxRow; r++) {
          if (!cache.has(r)) {
            allCached = false;
            break;
          }
        }
      } else {
        allCached = false;
      }

      let tsvText = '';
      if (allCached && cache) {
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
  }, [metadata, selectedRange, activeCell, filterIndices, sortConfig, formatTsvField, safeWriteClipboard, rowCacheRef]);

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

        const cachedRow = rowCacheRef.current?.get(targetVirtualRow) || [];

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
  }, [
    metadata,
    activeCell,
    editingCell,
    effectiveTotalRows,
    filterMode,
    filterIndices,
    onBatchCellEdited,
    rowCacheRef,
    setCacheVersion,
  ]);

  return {
    copyToast,
    handleCopyTsv,
    handlePasteClipboard,
  };
}
