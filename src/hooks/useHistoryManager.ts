import React, { useState, useCallback } from 'react';
import { CellCoordinate, FileMetadata, HistoryAction } from '../types/csv';
import { TauriBridge } from '../services/tauriBridge';

interface UseHistoryManagerParams {
  setMetadata: React.Dispatch<React.SetStateAction<FileMetadata | null>>;
  setActiveCell: (coord: CellCoordinate | null) => void;
  setActiveCellValue: (val: string) => void;
  setJumpToRowTrigger: (row: number | null) => void;
  setModifiedCells: React.Dispatch<React.SetStateAction<Set<string>>>;
  activeCell: CellCoordinate | null;
}

export function useHistoryManager({
  setMetadata,
  setActiveCell,
  setActiveCellValue,
  setJumpToRowTrigger,
  setModifiedCells,
  activeCell,
}: UseHistoryManagerParams) {
  const [undoStack, setUndoStack] = useState<HistoryAction[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryAction[]>([]);

  const pushAction = useCallback((action: HistoryAction) => {
    setUndoStack((prev) => [...prev, action]);
    setRedoStack([]);
  }, []);

  const clearHistory = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  // Undo 実行ロジック
  const handleUndo = useCallback(async () => {
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
          const res = await TauriBridge.deleteRow(action.row);
          setMetadata((prev) => (prev ? { ...prev, totalRows: res.totalRows ?? prev.totalRows - 1 } : null));
          break;
        }
        case 'DELETE_ROW': {
          const res = await TauriBridge.insertRow(action.row, action.rowData);
          setMetadata((prev) => (prev ? { ...prev, ...res } : null));
          setActiveCell({ row: action.row, col: activeCell?.col || 0 });
          setJumpToRowTrigger(action.row);
          break;
        }
        case 'DUPLICATE_ROW': {
          const res = await TauriBridge.deleteRow(action.targetRow);
          setMetadata((prev) => (prev ? { ...prev, totalRows: res.totalRows ?? prev.totalRows - 1 } : null));
          break;
        }
        case 'INSERT_COL': {
          const res = await TauriBridge.deleteCol(action.col);
          setMetadata((prev) =>
            prev
              ? {
                  ...prev,
                  totalCols: res.totalCols ?? prev.totalCols - 1,
                  headers: res.headers ?? prev.headers,
                }
              : null
          );
          break;
        }
        case 'DELETE_COL': {
          const res = await TauriBridge.insertCol(action.col, action.headerName);
          for (let r = 0; r < action.colValues.length; r++) {
            await TauriBridge.editCell(r, action.col, action.colValues[r]);
          }
          setMetadata((prev) => (prev ? { ...prev, ...res } : null));
          break;
        }
        case 'DUPLICATE_COL': {
          const res = await TauriBridge.deleteCol(action.targetCol);
          setMetadata((prev) =>
            prev
              ? {
                  ...prev,
                  totalCols: res.totalCols ?? prev.totalCols - 1,
                  headers: res.headers ?? prev.headers,
                }
              : null
          );
          break;
        }
        case 'BATCH_REPLACE': {
          for (const c of action.changes) {
            await TauriBridge.editCell(c.row, c.col, c.prevValue);
          }
          setModifiedCells((prev) => {
            const next = new Set(prev);
            action.changes.forEach((c) => next.add(`${c.row},${c.col}`));
            return next;
          });
          if (action.changes.length > 0) {
            setActiveCell({ row: action.changes[0].row, col: action.changes[0].col });
            setJumpToRowTrigger(action.changes[0].row);
          }
          break;
        }
      }

      setUndoStack(newUndoStack);
      setRedoStack((prev) => [...prev, action]);
    } catch (err) {
      console.error('Failed to execute Undo:', err);
    }
  }, [undoStack, activeCell, setActiveCell, setActiveCellValue, setJumpToRowTrigger, setMetadata, setModifiedCells]);

  // Redo 実行ロジック
  const handleRedo = useCallback(async () => {
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
          setMetadata((prev) =>
            prev
              ? {
                  ...prev,
                  totalCols: res.totalCols ?? prev.totalCols - 1,
                  headers: res.headers ?? prev.headers,
                }
              : null
          );
          break;
        }
        case 'DUPLICATE_COL': {
          const res = await TauriBridge.duplicateCol(action.sourceCol, action.targetCol, action.headerName);
          setMetadata((prev) =>
            prev
              ? {
                  ...prev,
                  totalCols: res.totalCols ?? prev.totalCols + 1,
                  headers: res.headers ?? prev.headers,
                }
              : null
          );
          break;
        }
        case 'BATCH_REPLACE': {
          for (const c of action.changes) {
            await TauriBridge.editCell(c.row, c.col, c.newValue);
          }
          setModifiedCells((prev) => {
            const next = new Set(prev);
            action.changes.forEach((c) => next.add(`${c.row},${c.col}`));
            return next;
          });
          if (action.changes.length > 0) {
            setActiveCell({ row: action.changes[0].row, col: action.changes[0].col });
            setJumpToRowTrigger(action.changes[0].row);
          }
          break;
        }
      }

      setRedoStack(newRedoStack);
      setUndoStack((prev) => [...prev, action]);
    } catch (err) {
      console.error('Failed to execute Redo:', err);
    }
  }, [redoStack, activeCell, setActiveCell, setActiveCellValue, setJumpToRowTrigger, setMetadata, setModifiedCells]);

  return {
    undoStack,
    redoStack,
    setUndoStack,
    setRedoStack,
    pushAction,
    clearHistory,
    handleUndo,
    handleRedo,
  };
}
