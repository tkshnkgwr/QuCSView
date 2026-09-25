import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FileMetadata } from '../../types/csv';
import { DEFAULT_COL_WIDTH, MIN_COL_WIDTH, ROW_NUM_WIDTH } from './tableConstants';

interface UseColumnResizeParams {
  metadata: FileMetadata;
  rowCacheRef: React.RefObject<Map<number, string[]>>;
}

export function useColumnResize({ metadata, rowCacheRef }: UseColumnResizeParams) {
  const [columnWidths, setColumnWidths] = useState<number[]>([]);
  const resizingColRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  // 初期列幅の設定
  useEffect(() => {
    if (metadata.headers.length > 0) {
      setColumnWidths((prev) => {
        if (prev.length === metadata.headers.length) return prev;
        return metadata.headers.map(() => DEFAULT_COL_WIDTH);
      });
    }
  }, [metadata.headers]);

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

  // テーブル全体の横幅
  const totalTableWidth = useMemo(() => {
    return columnWidths.reduce((acc, w) => acc + w, ROW_NUM_WIDTH);
  }, [columnWidths]);

  // 列幅自動調整 (Auto-Fit Column Width)
  const handleAutoFitColumn = useCallback(
    (colIdx: number) => {
      if (!metadata) return;
      const headerText = metadata.headers[colIdx] || '';
      let maxLen = 0;

      let headerWeight = 0;
      for (const char of headerText) {
        headerWeight += char.charCodeAt(0) > 127 ? 2 : 1;
      }
      maxLen = Math.max(maxLen, headerWeight);

      // キャッシュされている全行からセル文字列長を走査
      rowCacheRef.current?.forEach((row) => {
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
    },
    [metadata, rowCacheRef]
  );

  // カラム幅リサイズ処理 (ドラッグ操作)
  const handleMouseDownResize = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizingColRef.current = {
        index,
        startX: e.clientX,
        startWidth: columnWidths[index] || DEFAULT_COL_WIDTH,
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!resizingColRef.current) return;
        const { index: colIdx, startX, startWidth } = resizingColRef.current;
        const diff = moveEvent.clientX - startX;
        const newWidth = Math.max(MIN_COL_WIDTH, startWidth + diff);
        setColumnWidths((prev) => {
          const next = [...prev];
          next[colIdx] = newWidth;
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
    },
    [columnWidths]
  );

  return {
    columnWidths,
    setColumnWidths,
    columnOffsets,
    totalTableWidth,
    handleAutoFitColumn,
    handleMouseDownResize,
  };
}
