import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { CellCoordinate, SortConfig } from '../../types/csv';
import { ContextMenuTarget } from '../TableContextMenu';
import { DEFAULT_COL_WIDTH } from './tableConstants';

interface TableHeaderProps {
  totalTableWidth: number;
  renderStartCol: number;
  renderEndCol: number;
  headers: string[];
  columnWidths: number[];
  columnOffsets: number[];
  sortConfig: SortConfig;
  hasHeader: boolean;
  activeCell: CellCoordinate | null;
  onSortColumn: (colIndex: number) => void;
  onContextMenu: (target: ContextMenuTarget) => void;
  handleMouseDownResize: (index: number, e: React.MouseEvent) => void;
  handleAutoFitColumn: (colIdx: number) => void;
}

export const TableHeader: React.FC<TableHeaderProps> = React.memo(({
  totalTableWidth,
  renderStartCol,
  renderEndCol,
  headers,
  columnWidths,
  columnOffsets,
  sortConfig,
  hasHeader,
  activeCell,
  onSortColumn,
  onContextMenu,
  handleMouseDownResize,
  handleAutoFitColumn,
}) => {
  return (
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
        const header = headers[colIdx];
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
              onContextMenu({
                type: 'col',
                rowIndex: activeCell ? activeCell.row : 0,
                colIndex: colIdx,
                x: e.clientX,
                y: e.clientY,
              });
            }}
            title={
              isHeaderless
                ? `列 ${colIdx + 1} (タイトル行なし - 列番号: ${colIdx + 1}) (右クリックで列操作)`
                : `クリックでソート: ${header} (右クリックで列操作)`
            }
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

            {/* カラム幅リサイズハンドル */}
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
  );
});

TableHeader.displayName = 'TableHeader';
