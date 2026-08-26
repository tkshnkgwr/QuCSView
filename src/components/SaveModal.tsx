// UPDATE 2026-08-20: [機能追加] 保存先・文字コード・改行コード・区切り文字を指定可能な保存オプションダイアログ
import React, { useState, useEffect, useRef } from 'react';
import {
  Save,
  X,
  FileSpreadsheet,
  FileCode,
  CornerDownLeft,
  Sliders,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  FileMetadata,
  SupportedEncoding,
  SupportedLineEnding,
  SupportedDelimiter,
} from '../types/csv';

interface SaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  metadata: FileMetadata | null;
  onSaveConfirm: (options: {
    fileName: string;
    encoding: SupportedEncoding;
    lineEnding: SupportedLineEnding;
    delimiter: SupportedDelimiter;
  }) => void;
}

export const SaveModal: React.FC<SaveModalProps> = ({
  isOpen,
  onClose,
  metadata,
  onSaveConfirm,
}) => {
  const [fileName, setFileName] = useState('');
  const [encoding, setEncoding] = useState<SupportedEncoding>('UTF-8');
  const [lineEnding, setLineEnding] = useState<SupportedLineEnding>('LF');
  const [delimiter, setDelimiter] = useState<SupportedDelimiter>(',');
  const fileNameInputRef = useRef<HTMLInputElement>(null);

  // モーダルオープン時に現在のメタデータで初期化
  useEffect(() => {
    if (isOpen && metadata) {
      setFileName(metadata.fileName);
      setEncoding(metadata.encoding);
      setLineEnding(metadata.lineEnding);
      setDelimiter(metadata.delimiter);

      setTimeout(() => {
        fileNameInputRef.current?.focus();
        fileNameInputRef.current?.select();
      }, 50);
    }
  }, [isOpen, metadata]);

  // 区切り文字変更時に拡張子サジェスト
  const handleDelimiterChange = (newDelim: SupportedDelimiter) => {
    setDelimiter(newDelim);
    if (newDelim === '\t' && fileName.endsWith('.csv')) {
      setFileName((prev) => prev.replace(/\.csv$/i, '.tsv'));
    } else if (newDelim === ',' && fileName.endsWith('.tsv')) {
      setFileName((prev) => prev.replace(/\.tsv$/i, '.csv'));
    }
  };

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const finalName = fileName.trim() || 'export.csv';
    onSaveConfirm({
      fileName: finalName,
      encoding,
      lineEnding,
      delimiter,
    });
    onClose();
  };

  // Esc / Ctrl+Enter ショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, fileName, encoding, lineEnding, delimiter]);

  if (!isOpen || !metadata) return null;

  return (
// UPDATE 2026-08-26: [ライト/ダーク両対応ファイル保存ダイアログ]
// なぜ: 無効な light: 構文を除去し、保存モーダルのライトモード（デフォルト白基調）と dark: バリアントによるスタイリングを完全適用するため
    <div
      id="save-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        id="save-modal-container"
        className="bg-white dark:bg-[#16191E] border border-gray-300 dark:border-[#2D3139] rounded-lg shadow-2xl w-full max-w-lg overflow-hidden flex flex-col font-sans text-gray-800 dark:text-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* モーダルヘッダー */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-gray-100 dark:bg-[#1C2027] border-b border-gray-300 dark:border-[#2D3139]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-blue-100 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400">
              <Save className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                ファイル保存設定
                <span className="text-[10px] font-mono font-normal px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                  Ctrl+S / Save As
                </span>
              </h2>
            </div>
          </div>
          <button
            id="btn-close-save-modal"
            onClick={onClose}
            className="p-1 rounded text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
            title="閉じる (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* モーダルフォームボディ */}
        <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
          {/* 保存ファイル名 / パス */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-gray-700 dark:text-gray-300 flex items-center justify-between">
              <span>保存ファイル名 / パス</span>
              <span className="text-[11px] font-normal text-gray-500">拡張子: .csv / .tsv / .txt</span>
            </label>
            <div className="relative flex items-center">
              <FileSpreadsheet className="w-4 h-4 absolute left-2.5 text-gray-400 pointer-events-none" />
              <input
                ref={fileNameInputRef}
                type="text"
                id="input-save-filename"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="filename.csv"
                className="w-full bg-gray-50 dark:bg-[#0F1115] border border-gray-300 dark:border-[#2D3139] rounded pl-9 pr-3 py-2 text-xs font-mono text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none transition-colors"
                required
              />
            </div>
          </div>

          {/* 3分割設定グリッド (区切り文字, 文字コード, 改行コード) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            {/* 区切り文字 */}
            <div className="space-y-1.5">
              <label className="block font-semibold text-gray-700 dark:text-gray-300">
                区切り文字 (Delimiter)
              </label>
              <select
                id="select-save-delimiter"
                value={delimiter}
                onChange={(e) => handleDelimiterChange(e.target.value as SupportedDelimiter)}
                className="w-full bg-gray-50 dark:bg-[#0F1115] border border-gray-300 dark:border-[#2D3139] rounded px-2.5 py-1.5 font-mono text-xs text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:outline-none cursor-pointer"
              >
                <option value="," className="bg-white dark:bg-[#1A1D23] text-gray-900 dark:text-gray-200">カンマ (CSV ,)</option>
                <option value="&#9;" className="bg-white dark:bg-[#1A1D23] text-gray-900 dark:text-gray-200">タブ (TSV \t)</option>
                <option value=";" className="bg-white dark:bg-[#1A1D23] text-gray-900 dark:text-gray-200">セミコロン (;)</option>
                <option value="|" className="bg-white dark:bg-[#1A1D23] text-gray-900 dark:text-gray-200">パイプ (|)</option>
              </select>
            </div>

            {/* 文字コード (Encoding) */}
            <div className="space-y-1.5">
              <label className="block font-semibold text-gray-700 dark:text-gray-300">
                文字コード (Encoding)
              </label>
              <select
                id="select-save-encoding"
                value={encoding}
                onChange={(e) => setEncoding(e.target.value as SupportedEncoding)}
                className="w-full bg-gray-50 dark:bg-[#0F1115] border border-gray-300 dark:border-[#2D3139] rounded px-2.5 py-1.5 font-mono text-xs text-blue-600 dark:text-blue-400 font-medium focus:border-blue-500 focus:outline-none cursor-pointer"
              >
                <option value="UTF-8" className="bg-white dark:bg-[#1A1D23] text-gray-900 dark:text-gray-200">UTF-8 (標準)</option>
                <option value="UTF-8 BOM" className="bg-white dark:bg-[#1A1D23] text-gray-900 dark:text-gray-200">UTF-8 BOM (Excel互換)</option>
                <option value="Shift_JIS" className="bg-white dark:bg-[#1A1D23] text-gray-900 dark:text-gray-200">Shift_JIS (CP932)</option>
                <option value="EUC-JP" className="bg-white dark:bg-[#1A1D23] text-gray-900 dark:text-gray-200">EUC-JP (Unix互換)</option>
              </select>
            </div>

            {/* 改行コード (Line Ending) */}
            <div className="space-y-1.5">
              <label className="block font-semibold text-gray-700 dark:text-gray-300">
                改行コード (EOL)
              </label>
              <select
                id="select-save-lineending"
                value={lineEnding}
                onChange={(e) => setLineEnding(e.target.value as SupportedLineEnding)}
                className="w-full bg-gray-50 dark:bg-[#0F1115] border border-gray-300 dark:border-[#2D3139] rounded px-2.5 py-1.5 font-mono text-xs text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:outline-none cursor-pointer"
              >
                <option value="CRLF" className="bg-white dark:bg-[#1A1D23] text-gray-900 dark:text-gray-200">CRLF (\r\n - Windows)</option>
                <option value="LF" className="bg-white dark:bg-[#1A1D23] text-gray-900 dark:text-gray-200">LF (\n - Unix/Mac)</option>
              </select>
            </div>
          </div>

          {/* 保存情報サマリー */}
          <div className="p-3 rounded bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-[#2D3139] space-y-1.5">
            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400 font-medium">
              <Sliders className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>保存構成サマリー</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono text-gray-600 dark:text-gray-400">
              <div>行・列数: <span className="text-gray-900 dark:text-gray-200 font-semibold">{metadata.totalRows.toLocaleString()} 行 × {metadata.totalCols} 列</span></div>
              <div>編集ステータス: <span className={metadata.isDirty ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-emerald-600 dark:text-emerald-400 font-semibold'}>{metadata.isDirty ? '● 未保存の変更あり' : '✓ 変更なし'}</span></div>
              <div>出力仕様: <span className="text-gray-900 dark:text-gray-200 font-semibold">{encoding} / {lineEnding} / {delimiter === '\t' ? 'TAB' : delimiter === ';' ? 'SEMICOLON' : delimiter === '|' ? 'PIPE' : 'COMMA'}</span></div>
              <div>型安全保証: <span className="text-blue-600 dark:text-blue-400 font-semibold">型変換・ゼロ落ちなし (100% Raw)</span></div>
            </div>
          </div>

          {/* モーダルフッター */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-200 dark:border-[#2D3139]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-gray-300 dark:border-[#2D3139] hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors font-medium cursor-pointer"
            >
              キャンセル (Esc)
            </button>
            <button
              type="submit"
              id="btn-confirm-save"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors shadow-xs active:scale-95 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>この設定で保存 (Enter)</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
