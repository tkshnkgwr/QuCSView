// UPDATE 2026-08-27: [テキスト表示モードのリアルタイム検索ハイライト＆ナビゲーション]
// なぜ: テキスト表示モードでも検索キーワードのハイライト表示（通常一致/現在選択一致）、正規表現/大文字小文字対応、および一致箇所への自動スクロールと選択フォーカスを提供するため。
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { FileMetadata } from '../types/csv';
import { Copy, Check, WrapText, FileText } from 'lucide-react';

interface RawTextViewProps {
  rawText: string;
  metadata: FileMetadata;
  searchQuery?: string;
  searchCaseSensitive?: boolean;
  searchUseRegex?: boolean;
  currentMatchIndex?: number;
  onTextChange: (newText: string) => void;
  onSaveFile: () => void;
}

interface TextMatchRange {
  start: number;
  end: number;
  line: number;
}

export const RawTextView: React.FC<RawTextViewProps> = ({
  rawText,
  metadata,
  searchQuery = '',
  searchCaseSensitive = false,
  searchUseRegex = false,
  currentMatchIndex = 0,
  onTextChange,
}) => {
  const [localText, setLocalText] = useState(rawText);
  const [isCopied, setIsCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalText(rawText);
  }, [rawText]);

  // 行数・文字数・バイト数の計算
  const lines = useMemo(() => {
    return localText.split(/\r?\n/);
  }, [localText]);

  const lineCount = lines.length;
  const charCount = localText.length;
  const byteCount = useMemo(() => {
    return new TextEncoder().encode(localText).length;
  }, [localText]);

  // テキスト内の全検索マッチ位置を計算
  const textMatches = useMemo<TextMatchRange[]>(() => {
    if (!searchQuery.trim() || !localText) return [];

    const matches: TextMatchRange[] = [];
    try {
      let regex: RegExp;
      if (searchUseRegex) {
        regex = new RegExp(searchQuery, searchCaseSensitive ? 'g' : 'gi');
      } else {
        const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(escaped, searchCaseSensitive ? 'g' : 'gi');
      }

      let match: RegExpExecArray | null;
      let currentLine = 0;
      let lineStartOffset = 0;

      while ((match = regex.exec(localText)) !== null) {
        if (match[0].length === 0) {
          regex.lastIndex++;
          continue;
        }

        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;

        // 行番号を算出
        while (
          currentLine < lines.length &&
          lineStartOffset + lines[currentLine].length < matchStart
        ) {
          lineStartOffset += lines[currentLine].length + 1; // +1 for \n
          currentLine++;
        }

        matches.push({
          start: matchStart,
          end: matchEnd,
          line: currentLine,
        });

        // 制限 (UIフリーズ防止)
        if (matches.length >= 5000) break;
      }
    } catch {
      return [];
    }

    return matches;
  }, [localText, searchQuery, searchCaseSensitive, searchUseRegex, lines]);

  // スクロール同期 (textarea -> 背景ハイライト & 行番号ガター)
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (backdropRef.current) {
      backdropRef.current.scrollTop = scrollTop;
      backdropRef.current.scrollLeft = scrollLeft;
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = scrollTop;
    }
  };

  // 検索ヒット位置への自動スクロール＆フォーカス
  useEffect(() => {
    if (textMatches.length === 0 || !textareaRef.current) return;

    const safeIdx = Math.min(Math.max(0, currentMatchIndex), textMatches.length - 1);
    const targetMatch = textMatches[safeIdx];
    if (!targetMatch) return;

    const textarea = textareaRef.current;
    const lineHeight = 20; // leading-5 = 20px
    const targetScrollTop = Math.max(0, targetMatch.line * lineHeight - 100);

    textarea.scrollTop = targetScrollTop;
    if (backdropRef.current) {
      backdropRef.current.scrollTop = targetScrollTop;
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = targetScrollTop;
    }

    // 選択範囲をセット
    try {
      textarea.setSelectionRange(targetMatch.start, targetMatch.end);
    } catch (_) {}
  }, [currentMatchIndex, textMatches]);

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

  // 背景ハイライトHTMLの生成
  const highlightedContent = useMemo(() => {
    if (!searchQuery.trim() || textMatches.length === 0) {
      return localText;
    }

    const elements: React.ReactNode[] = [];
    let lastIndex = 0;

    textMatches.forEach((m, idx) => {
      // マッチ前の通常テキスト
      if (m.start > lastIndex) {
        elements.push(localText.slice(lastIndex, m.start));
      }

      const matchText = localText.slice(m.start, m.end);
      const isCurrent = idx === currentMatchIndex % Math.max(1, textMatches.length);

      elements.push(
        <mark
          key={`mark-${m.start}-${idx}`}
          className={`rounded-2xs px-0 py-0.5 font-mono ${
            isCurrent
              ? 'bg-amber-400 dark:bg-amber-500 text-gray-950 font-bold ring-2 ring-amber-600 dark:ring-amber-300'
              : 'bg-yellow-200 dark:bg-yellow-600/70 text-gray-900 dark:text-gray-100'
          }`}
        >
          {matchText}
        </mark>
      );

      lastIndex = m.end;
    });

    if (lastIndex < localText.length) {
      elements.push(localText.slice(lastIndex));
    }

    return elements;
  }, [localText, searchQuery, textMatches, currentMatchIndex]);

  return (
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
          <span className="tabular-nums font-semibold text-gray-700 dark:text-gray-300">
            {lineCount.toLocaleString()} 行
          </span>
          <span>•</span>
          <span className="tabular-nums text-gray-700 dark:text-gray-300">
            {charCount.toLocaleString()} 文字
          </span>
          <span>•</span>
          <span className="tabular-nums text-gray-700 dark:text-gray-300">
            {(byteCount / 1024).toFixed(1)} KB
          </span>
          {searchQuery && (
            <>
              <span className="text-gray-400 dark:text-gray-600">|</span>
              <span className="text-blue-600 dark:text-blue-400 font-bold">
                🔍 一致: {textMatches.length.toLocaleString()} 件
                {textMatches.length > 0 && ` (${(currentMatchIndex % textMatches.length) + 1}/${textMatches.length})`}
              </span>
            </>
          )}
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

      {/* エディタ本体 (行番号ガター + リアルタイムハイライトオーバーレイ + 高速テキストエリア) */}
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

        {/* テキストエディタ＆ハイライトコンテナ */}
        <div className="flex-1 relative overflow-hidden bg-white dark:bg-[#0F1115]">
          {/* 背景ハイライトレイヤー */}
          <div
            ref={backdropRef}
            aria-hidden="true"
            className={`absolute inset-0 p-2 text-xs font-mono leading-5 overflow-hidden pointer-events-none select-none text-transparent ${
              wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
            }`}
          >
            {highlightedContent}
          </div>

          {/* 前面テキストエリア */}
          <textarea
            id="textarea-raw-csv"
            ref={textareaRef}
            value={localText}
            onChange={handleChange}
            onScroll={handleScroll}
            spellCheck={false}
            wrap={wordWrap ? 'soft' : 'off'}
            className={`absolute inset-0 w-full h-full bg-transparent text-gray-900 dark:text-gray-100 p-2 text-xs font-mono focus:outline-none resize-none leading-5 caret-blue-600 dark:caret-blue-400 ${
              wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
            }`}
            placeholder="CSV/TSVテキストがここに表示されます..."
          />
        </div>
      </div>
    </div>
  );
};
