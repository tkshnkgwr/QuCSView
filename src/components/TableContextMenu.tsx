// UPDATE 2026-08-26: [行・列コンテキストメニュー (右クリック操作)]
// なぜ: 行や列の追加、複製、削除を直感的に行えるようにするため。
import React, { useEffect, useRef } from 'react';
import {
  Plus,
  Copy,
  Trash2,
  Rows,
  Columns,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';

export interface ContextMenuTarget {
  type: 'row' | 'col' | 'cell';
  rowIndex: number;
  colIndex: number;
  x: number;
  y: number;
}

interface TableContextMenuProps {
  target: ContextMenuTarget | null;
  onClose: () => void;
  onCopy?: () => void;
  onInsertRowAbove: (row: number) => void;
  onInsertRowBelow: (row: number) => void;
  onDuplicateRow: (row: number) => void;
  onDeleteRow: (row: number) => void;
  onInsertColLeft: (col: number) => void;
  onInsertColRight: (col: number) => void;
  onDuplicateCol: (col: number) => void;
  onDeleteCol: (col: number) => void;
}

export const TableContextMenu: React.FC<TableContextMenuProps> = ({
  target,
  onClose,
  onCopy,
  onInsertRowAbove,
  onInsertRowBelow,
  onDuplicateRow,
  onDeleteRow,
  onInsertColLeft,
  onInsertColRight,
  onDuplicateCol,
  onDeleteCol,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (!target) return null;

  // 画面外はみ出し防止
  const menuX = Math.min(target.x, window.innerWidth - 220);
  const menuY = Math.min(target.y, window.innerHeight - 300);

  return (
// UPDATE 2026-08-26: [ライト/ダーク両対応コンテキストメニュー]
// なぜ: 無効な light: 構文を除去し、ライトモード（デフォルト白基調）と dark: バリアントによるスタイリングを完全適用するため
    <div
      ref={menuRef}
      id="table-context-menu"
      style={{ top: `${menuY}px`, left: `${menuX}px` }}
      className="fixed z-50 w-52 bg-white dark:bg-[#1A1D23] border border-gray-300 dark:border-[#2D3139] rounded-lg shadow-2xl py-1 text-xs font-mono select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {/* 対象行情報 */}
      <div className="px-3 py-1 text-[10px] text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-[#2D3139] flex items-center justify-between">
        <span>行: {(target.rowIndex + 1).toLocaleString()}</span>
        <span>列: {(target.colIndex + 1).toLocaleString()}</span>
      </div>

      {/* コピー操作 */}
      {onCopy && (
        <div className="py-1 border-b border-gray-200 dark:border-[#2D3139]">
          <button
            onClick={() => {
              onCopy();
              onClose();
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center justify-between text-gray-800 dark:text-gray-200 font-medium"
          >
            <div className="flex items-center gap-2">
              <Copy className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>選択範囲をコピー</span>
            </div>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">Ctrl+C</span>
          </button>
        </div>
      )}

      {/* 行操作 */}
      <div className="py-1">
        <div className="px-3 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
          <Rows className="w-3 h-3" />
          <span>行の操作</span>
        </div>
        <button
          onClick={() => {
            onInsertRowAbove(target.rowIndex);
            onClose();
          }}
          className="w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[#242A35] flex items-center gap-2 text-gray-800 dark:text-gray-200"
        >
          <ArrowUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>上に行を挿入</span>
        </button>
        <button
          onClick={() => {
            onInsertRowBelow(target.rowIndex);
            onClose();
          }}
          className="w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[#242A35] flex items-center gap-2 text-gray-800 dark:text-gray-200"
        >
          <ArrowDown className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>下に行を挿入</span>
        </button>
        <button
          onClick={() => {
            onDuplicateRow(target.rowIndex);
            onClose();
          }}
          className="w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[#242A35] flex items-center gap-2 text-gray-800 dark:text-gray-200"
        >
          <Copy className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>この行を複製</span>
        </button>
        <button
          onClick={() => {
            onDeleteRow(target.rowIndex);
            onClose();
          }}
          className="w-full text-left px-3 py-1 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-2 text-red-600 dark:text-red-400"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>この行を削除</span>
        </button>
      </div>

      <div className="border-t border-gray-200 dark:border-[#2D3139] my-0.5" />

      {/* 列操作 */}
      <div className="py-1">
        <div className="px-3 py-0.5 text-[10px] font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1">
          <Columns className="w-3 h-3" />
          <span>列の操作</span>
        </div>
        <button
          onClick={() => {
            onInsertColLeft(target.colIndex);
            onClose();
          }}
          className="w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[#242A35] flex items-center gap-2 text-gray-800 dark:text-gray-200"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>左に列を挿入</span>
        </button>
        <button
          onClick={() => {
            onInsertColRight(target.colIndex);
            onClose();
          }}
          className="w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[#242A35] flex items-center gap-2 text-gray-800 dark:text-gray-200"
        >
          <ArrowRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>右に列を挿入</span>
        </button>
        <button
          onClick={() => {
            onDuplicateCol(target.colIndex);
            onClose();
          }}
          className="w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[#242A35] flex items-center gap-2 text-gray-800 dark:text-gray-200"
        >
          <Copy className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
          <span>この列を複製</span>
        </button>
        <button
          onClick={() => {
            onDeleteCol(target.colIndex);
            onClose();
          }}
          className="w-full text-left px-3 py-1 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-2 text-red-600 dark:text-red-400"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>この列を削除</span>
        </button>
      </div>
    </div>
  );
};
