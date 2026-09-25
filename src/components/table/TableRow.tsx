import React from 'react';
import { CellCoordinate, CellRange, SearchMatch } from '../../types/csv';
import { ContextMenuTarget } from '../TableContextMenu';
import { DEFAULT_COL_WIDTH, ROW_HEIGHT } from './tableConstants';
import { renderHighlightedText } from './textHighlight';

interface TableRowProps {
  virtualRowIdx: number;
  effectiveTotalRows: number;
  filterMode?: boolean;
  filterIndices?: number[] | null;
  totalTableWidth: number;
  rowCells: string[];
  renderStartCol: number;
  renderEndCol: number;
  columnWidths: number[];
  columnOffsets: number[];
  isRowSelected: (rowIdx: number) => boolean;
  isCellInRange: (rowIdx: number, colIdx: number) => boolean;
  activeCell: CellCoordinate | null;
  selectionAnchor: CellCoordinate | null;
  editingCell: { row: number; col: number; virtualIdx: number; initialValue: string } | null;
  editValue: string;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  modifiedCells?: Set<string>;
  currentSearchMatch: SearchMatch | null;
  searchQuery?: string;
  searchCaseSensitive?: boolean;
  searchUseRegex?: boolean;
  totalCols: number;
  hasHeader?: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  setEditValue: (val: string) => void;
  commitEdit: () => void;
  startEditing: (row: number, col: number, virtualIdx: number, currentValue: string) => void;
  setActiveCell: (coord: CellCoordinate | null) => void;
  setSelectionAnchor: (coord: CellCoordinate | null) => void;
  setSelectedRange: (range: CellRange | null) => void;
  setIsSelecting: (isSelecting: boolean) => void;
  isSelecting: boolean;
  onActiveCellChange?: (coord: CellCoordinate | null, value: string) => void;
  setContextMenuTarget: (target: ContextMenuTarget) => void;
}

export const TableRow: React.FC<TableRowProps> = React.memo(({
  virtualRowIdx,
  effectiveTotalRows,
  filterMode = false,
  filterIndices,
  totalTableWidth,
  rowCells,
  renderStartCol,
  renderEndCol,
  columnWidths,
  columnOffsets,
  isRowSelected,
  isCellInRange,
  activeCell,
  selectionAnchor,
  editingCell,
  editValue,
  editInputRef,
  modifiedCells,
  currentSearchMatch,
  searchQuery = '',
  searchCaseSensitive = false,
  searchUseRegex = false,
  totalCols,
  hasHeader = true,
  containerRef,
  setEditValue,
  commitEdit,
  startEditing,
  setActiveCell,
  setSelectionAnchor,
  setSelectedRange,
  setIsSelecting,
  isSelecting,
  onActiveCellChange,
  setContextMenuTarget,
}) => {
  if (virtualRowIdx >= effectiveTotalRows) return null;

  const physicalRowIdx = filterMode && filterIndices
    ? (filterIndices[virtualRowIdx] !== undefined ? filterIndices[virtualRowIdx] : virtualRowIdx)
    : virtualRowIdx;
  const displayRowNumber = physicalRowIdx + 1;
  const targetRowIndex = filterMode ? virtualRowIdx : physicalRowIdx;
  const thisRowSelected = isRowSelected(targetRowIndex);

  return (
    <div
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
          containerRef.current?.focus();
          if (e.shiftKey && (selectionAnchor || activeCell)) {
            const anchor = selectionAnchor || activeCell!;
            setSelectedRange({
              startRow: anchor.row,
              startCol: 0,
              endRow: targetRowIndex,
              endCol: totalCols - 1,
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
              endCol: totalCols - 1,
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
              containerRef.current?.focus();
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
            title={
              isModified
                ? `未保存の編集セル (保存するまで強調表示): "${cellValue}" (右クリックで行・列操作)`
                : undefined
            }
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
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                }}
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
});

TableRow.displayName = 'TableRow';
