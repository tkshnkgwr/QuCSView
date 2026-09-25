import React, { useCallback } from 'react';
import { CellCoordinate, FileMetadata, HistoryAction, SortConfig } from '../types/csv';
import { TauriBridge } from '../services/tauriBridge';

interface UseTableOperationsParams {
  metadata: FileMetadata | null;
  setMetadata: React.Dispatch<React.SetStateAction<FileMetadata | null>>;
  activeCell: CellCoordinate | null;
  setActiveCell: (coord: CellCoordinate | null) => void;
  setActiveCellValue: (val: string) => void;
  setModifiedCells: React.Dispatch<React.SetStateAction<Set<string>>>;
  setJumpToRowTrigger: (row: number | null) => void;
  pushAction: (action: HistoryAction) => void;
  setSortConfig: React.Dispatch<React.SetStateAction<SortConfig>>;
}

export function useTableOperations({
  metadata,
  setMetadata,
  activeCell,
  setActiveCell,
  setActiveCellValue,
  setModifiedCells,
  setJumpToRowTrigger,
  pushAction,
  setSortConfig,
}: UseTableOperationsParams) {
  // セル編集完了コールバック
  const handleCellEdited = useCallback(
    async (row: number, col: number, value: string, prevValueParam?: string) => {
      try {
        const prevValue =
          prevValueParam !== undefined ? prevValueParam : await TauriBridge.getCellValue(row, col);
        if (prevValue === value) return;

        await TauriBridge.editCell(row, col, value);
        setActiveCellValue(value);
        setModifiedCells((prev) => new Set(prev).add(`${row},${col}`));
        setMetadata((prev) => (prev ? { ...prev, isDirty: true } : null));

        pushAction({
          type: 'EDIT_CELL',
          row,
          col,
          prevValue,
          newValue: value,
        });
      } catch (err) {
        console.error('Failed to edit cell:', err);
      }
    },
    [pushAction, setActiveCellValue, setMetadata, setModifiedCells]
  );

  // クリップボードからの矩形貼り付け一括編集ハンドラ
  const handleBatchCellEdited = useCallback(
    async (changes: Array<{ row: number; col: number; prevValue: string; newValue: string }>) => {
      if (changes.length === 0) return;

      try {
        for (const ch of changes) {
          await TauriBridge.editCell(ch.row, ch.col, ch.newValue);
        }

        setModifiedCells((prev) => {
          const next = new Set(prev);
          for (const ch of changes) {
            next.add(`${ch.row},${ch.col}`);
          }
          return next;
        });

        setMetadata((prev) => (prev ? { ...prev, isDirty: true } : null));

        pushAction({
          type: 'BATCH_REPLACE',
          description: `${changes.length} セルの貼り付け`,
          changes,
        });
      } catch (err) {
        console.error('Failed to apply batch pasted cells:', err);
      }
    },
    [pushAction, setMetadata, setModifiedCells]
  );

  // 行の挿入
  const handleInsertRow = useCallback(
    async (row: number, rowData?: string[]) => {
      try {
        const updatedMeta = await TauriBridge.insertRow(row, rowData);
        setMetadata((prev) => (prev ? { ...prev, ...updatedMeta, isDirty: true } : null));
        const actualRowData = rowData || new Array(metadata?.totalCols || 0).fill('');
        pushAction({
          type: 'INSERT_ROW',
          row,
          rowData: actualRowData,
        });
        setActiveCell({ row, col: activeCell?.col || 0 });
        setJumpToRowTrigger(row);
      } catch (err) {
        console.error('Failed to insert row:', err);
      }
    },
    [activeCell?.col, metadata?.totalCols, pushAction, setActiveCell, setJumpToRowTrigger, setMetadata]
  );

  // 行の削除
  const handleDeleteRow = useCallback(
    async (row: number) => {
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
        pushAction({
          type: 'DELETE_ROW',
          row,
          rowData: res.deletedData,
        });
        if (activeCell && activeCell.row >= (metadata?.totalRows || 1) - 1) {
          setActiveCell({ row: Math.max(0, (metadata?.totalRows || 1) - 2), col: activeCell.col });
        }
      } catch (err) {
        console.error('Failed to delete row:', err);
      }
    },
    [activeCell, metadata?.totalRows, pushAction, setActiveCell, setMetadata]
  );

  // 行の複製
  const handleDuplicateRow = useCallback(
    async (sourceRow: number) => {
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
        pushAction({
          type: 'DUPLICATE_ROW',
          sourceRow,
          targetRow: res.insertedRow,
          rowData: res.rowData,
        });
        setActiveCell({ row: res.insertedRow, col: activeCell?.col || 0 });
        setJumpToRowTrigger(res.insertedRow);
      } catch (err) {
        console.error('Failed to duplicate row:', err);
      }
    },
    [activeCell?.col, pushAction, setActiveCell, setJumpToRowTrigger, setMetadata]
  );

  // 列の挿入
  const handleInsertCol = useCallback(
    async (col: number, headerName?: string) => {
      try {
        const updatedMeta = await TauriBridge.insertCol(col, headerName);
        setMetadata((prev) => (prev ? { ...prev, ...updatedMeta, isDirty: true } : null));
        const actualHeader = headerName || `Col ${col + 1}`;
        pushAction({
          type: 'INSERT_COL',
          col,
          headerName: actualHeader,
        });
        setActiveCell({ row: activeCell?.row || 0, col });
      } catch (err) {
        console.error('Failed to insert column:', err);
      }
    },
    [activeCell?.row, pushAction, setActiveCell, setMetadata]
  );

  // 列の削除
  const handleDeleteCol = useCallback(
    async (col: number) => {
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
        pushAction({
          type: 'DELETE_COL',
          col,
          headerName: res.deletedHeader,
          colValues: res.deletedColValues,
        });
        if (activeCell && activeCell.col >= (metadata?.totalCols || 1) - 1) {
          setActiveCell({ row: activeCell.row, col: Math.max(0, (metadata?.totalCols || 1) - 2) });
        }
      } catch (err) {
        console.error('Failed to delete column:', err);
      }
    },
    [activeCell, metadata?.totalCols, pushAction, setActiveCell, setMetadata]
  );

  // 列の複製
  const handleDuplicateCol = useCallback(
    async (sourceCol: number) => {
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
        pushAction({
          type: 'DUPLICATE_COL',
          sourceCol,
          targetCol: res.insertedCol,
          headerName: res.headerName,
          colValues: res.colValues,
        });
        setActiveCell({ row: activeCell?.row || 0, col: res.insertedCol });
      } catch (err) {
        console.error('Failed to duplicate column:', err);
      }
    },
    [activeCell?.row, pushAction, setActiveCell, setMetadata]
  );

  // カラムソート
  const handleSortColumn = useCallback((colIndex: number) => {
    setSortConfig((prev) => {
      if (prev.column === colIndex) {
        if (prev.direction === 'asc') return { column: colIndex, direction: 'desc' };
        if (prev.direction === 'desc') return { column: null, direction: null };
      }
      return { column: colIndex, direction: 'asc' };
    });
  }, [setSortConfig]);

  return {
    handleCellEdited,
    handleBatchCellEdited,
    handleInsertRow,
    handleDeleteRow,
    handleDuplicateRow,
    handleInsertCol,
    handleDeleteCol,
    handleDuplicateCol,
    handleSortColumn,
  };
}
