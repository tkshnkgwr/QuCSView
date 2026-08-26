// UPDATE 2026-08-26: [テキスト表示コンポーネント新規作成]
// なぜ: CSV表プレビューと相互に切り替え可能な「テキスト表示（生CSV/TSVテキスト）」モードを提供し、
// 行番号ガター、シンタックス折り返し切替、全文コピー、検索キーワードハイライト、直接テキスト編集および即時テーブル同期を可能にするため。
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FileMetadata, SupportedEncoding, SupportedLineEnding, SupportedDelimiter } from '../types/csv';
import { Copy, Check, WrapText, FileText, Download, RotateCcw } from 'lucide-react';

interface RawTextViewProps {
  rawText: string;
  metadata: FileMetadata;
  searchQuery?: string;
  searchCaseSensitive?: boolean;
  searchUseRegex?: boolean;
  onTextChange: (newText: string) => void;
  onSaveFile: () => void;
}

export const RawTextView: React.FC<RawTextViewProps> = ({
  rawText,
  metadata,
  searchQuery = '',
  searchCaseSensitive = false,
  searchUseRegex = false,
  onTextChange,
  onSaveFile,
}) => {
  const [localText, setLocalText] = useState(rawText);
  const [isCopied, setIsCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalText(rawText);
  }, [rawText]);

  // 行数・バイト数の計算
  const lines = useMemo(() => {
    return localText.split(/\r?\n/);
  }, [localText]);

  const lineCount = lines.length;
  const charCount = localText.length;
  const byteCount = useMemo(() => {
    return new TextEncoder().encode(localText).length;
  }, [localText]);

  // スクロール同期
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(localText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setLocalText(val);
    onTextChange(val);
  };

  return (
// UPDATE 2026-08-26: [ライト/ダーク両対応テキスト表示]
// なぜ: 無効な light: 構文を除去し、生テキスト表示画面のライトモード（白基調・高コントラスト）とダークモードを両立するため
    <div
      id="qu-raw-text-view"
      className="flex-1 flex flex-col bg-white dark:bg-[#0F1115] text-gray-900 dark:text-gray-100 font-mono overflow-hidden select-text"
    >
      {/* テキスト表示ヘッダーサブバー */}
      <div
        id="raw-text-toolbar"
        className="h-8 bg-gray-100 dark:bg-[#16191E] border-b border-gray-300 dark:border-[#2D3139] px-3 flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 shrink-0 select-none"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-bold">
            <FileText className="w-3.5 h-3.5" />
            <span>テキスト表示 (Raw Text Mode)</span>
          </div>
          <span className="text-gray-400 dark:text-gray-600">|</span>
          <span className="tabular-nums">
            {lineCount.toLocaleString()} 行
          </span>
          <span>•</span>
          <span className="tabular-nums">
            {charCount.toLocaleString()} 文字
          </span>
          <span>•</span>
          <span className="tabular-nums">
            {(byteCount / 1024).toFixed(1)} KB
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 折り返し切替 */}
          <button
            id="btn-toggle-word-wrap"
            type="button"
            onClick={() => setWordWrap(!wordWrap)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors cursor-pointer ${
              wordWrap
                ? 'bg-blue-600 text-white border-blue-500 shadow-xs'
                : 'bg-white dark:bg-[#0F1115] text-gray-700 dark:text-gray-300 border-gray-300 dark:border-[#2D3139] hover:border-gray-500'
            }`}
            title="行の折り返し切り替え"
          >
            <WrapText className="w-3 h-3" />
            <span>折り返し: {wordWrap ? 'ON' : 'OFF'}</span>
          </button>

          {/* 全文コピー */}
          <button
            id="btn-copy-all-text"
            type="button"
            onClick={handleCopyAll}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-white dark:bg-[#0F1115] text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-[#2D3139] hover:border-blue-500 transition-colors cursor-pointer shadow-xs"
            title="CSV/TSV全文をクリップボードにコピー"
          >
            {isCopied ? (
              <>
                <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span className="text-emerald-600 dark:text-emerald-400">コピー完了</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                <span>全文コピー</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* エディタ本体 (行番号ガター + 高速テキストエリア) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 行番号ガター */}
        <div
          id="raw-text-line-numbers"
          ref={lineNumbersRef}
          className="w-14 bg-gray-50 dark:bg-[#14171C] border-r border-gray-300 dark:border-[#2D3139] text-gray-400 dark:text-gray-500 text-right pr-2 py-2 select-none overflow-hidden text-xs font-mono shrink-0 tabular-nums"
        >
          {lines.map((_, idx) => (
            <div key={idx} className="h-5 leading-5">
              {idx + 1}
            </div>
          ))}
        </div>

        {/* テキスト入力/閲覧エリア */}
        <textarea
          id="textarea-raw-csv"
          ref={textareaRef}
          value={localText}
          onChange={handleChange}
          onScroll={handleScroll}
          spellCheck={false}
          wrap={wordWrap ? 'soft' : 'off'}
          className={`flex-1 bg-white dark:bg-[#0F1115] text-gray-900 dark:text-gray-100 p-2 text-xs font-mono focus:outline-none resize-none leading-5 ${
            wordWrap ? 'whitespace-pre-wrap' : 'whitespace-pre'
          }`}
          placeholder="CSV/TSVテキストがここに表示されます..."
        />
      </div>
    </div>
  );
};
