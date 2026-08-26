// UPDATE 2026-08-26: [正規表現検索・一括置換モーダル]
// なぜ: 大容量CSVにおける正規表現キャプチャ置換および全文一括置換（Ctrl+H / ツールバー）を提供するため。

import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Replace,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { FileMetadata, SearchMatch } from '../types/csv';

interface FindReplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  metadata: FileMetadata | null;
  initialQuery?: string;
  initialUseRegex?: boolean;
  initialCaseSensitive?: boolean;
  initialColumnFilter?: number | null;
  onFindNext: (query: string, caseSensitive: boolean, useRegex: boolean, colFilter: number | null) => Promise<SearchMatch | null>;
  onFindPrev: (query: string, caseSensitive: boolean, useRegex: boolean, colFilter: number | null) => Promise<SearchMatch | null>;
  onReplaceCurrent: (
    query: string,
    replacement: string,
    caseSensitive: boolean,
    useRegex: boolean,
    colFilter: number | null
  ) => Promise<boolean>;
  onReplaceAll: (
    query: string,
    replacement: string,
    caseSensitive: boolean,
    useRegex: boolean,
    colFilter: number | null
  ) => Promise<number>;
}

export const FindReplaceModal: React.FC<FindReplaceModalProps> = ({
  isOpen,
  onClose,
  metadata,
  initialQuery = '',
  initialUseRegex = false,
  initialCaseSensitive = false,
  initialColumnFilter = null,
  onFindNext,
  onFindPrev,
  onReplaceCurrent,
  onReplaceAll,
}) => {
  const [activeTab, setActiveTab] = useState<'find' | 'replace'>('replace');
  const [query, setQuery] = useState(initialQuery);
  const [replacement, setReplacement] = useState('');
  const [useRegex, setUseRegex] = useState(initialUseRegex);
  const [caseSensitive, setCaseSensitive] = useState(initialCaseSensitive);
  const [columnFilter, setColumnFilter] = useState<number | null>(initialColumnFilter);
  const [regexError, setRegexError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const queryInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setUseRegex(initialUseRegex);
      setCaseSensitive(initialCaseSensitive);
      setColumnFilter(initialColumnFilter);
      setStatusMessage(null);
      setTimeout(() => {
        if (activeTab === 'replace' && query) {
          replaceInputRef.current?.focus();
        } else {
          queryInputRef.current?.focus();
          queryInputRef.current?.select();
        }
      }, 50);
    }
  }, [isOpen, initialQuery, initialUseRegex, initialCaseSensitive, initialColumnFilter]);

  // 正規表現構文検証
  useEffect(() => {
    if (useRegex && query) {
      try {
        new RegExp(query);
        setRegexError(null);
      } catch (err: any) {
        setRegexError(err.message || '無効な正規表現です');
      }
    } else {
      setRegexError(null);
    }
  }, [query, useRegex]);

  // キーボードショートカット（モーダル内）
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      if (e.shiftKey) {
        e.preventDefault();
        handleFindPrev();
      } else if (!e.ctrlKey && !e.altKey) {
        e.preventDefault();
        handleFindNext();
      }
    }
  };

  const handleFindNext = async () => {
    if (!query) return;
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const match = await onFindNext(query, caseSensitive, useRegex, columnFilter);
      if (match) {
        setStatusMessage({ text: `一致: 行 ${match.row + 1}, 列 ${match.col + 1}`, type: 'info' });
      } else {
        setStatusMessage({ text: '一致するセルは見つかりませんでした', type: 'error' });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFindPrev = async () => {
    if (!query) return;
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const match = await onFindPrev(query, caseSensitive, useRegex, columnFilter);
      if (match) {
        setStatusMessage({ text: `一致: 行 ${match.row + 1}, 列 ${match.col + 1}`, type: 'info' });
      } else {
        setStatusMessage({ text: '一致するセルは見つかりませんでした', type: 'error' });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReplaceCurrent = async () => {
    if (!query) return;
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const replaced = await onReplaceCurrent(query, replacement, caseSensitive, useRegex, columnFilter);
      if (replaced) {
        setStatusMessage({ text: 'セルを置換しました', type: 'success' });
      } else {
        setStatusMessage({ text: '置換対象のセルが見つかりません', type: 'info' });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReplaceAll = async () => {
    if (!query) return;
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const count = await onReplaceAll(query, replacement, caseSensitive, useRegex, columnFilter);
      if (count > 0) {
        setStatusMessage({ text: `🎉 ${count.toLocaleString()} 件のセルを一括置換しました`, type: 'success' });
      } else {
        setStatusMessage({ text: '置換対象のセルは見つかりませんでした', type: 'info' });
      }
    } catch (err: any) {
      setStatusMessage({ text: `置換エラー: ${err.message || String(err)}`, type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onKeyDown={handleKeyDown}
    >
      <div
        id="modal-find-replace"
        className="w-full max-w-lg bg-white dark:bg-[#16191E] border border-gray-300 dark:border-[#2D3139] rounded-xl shadow-2xl overflow-hidden flex flex-col text-gray-800 dark:text-gray-200"
      >
        {/* モーダルヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-100 dark:bg-[#1A1D23] border-b border-gray-200 dark:border-[#2D3139]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('replace')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                activeTab === 'replace'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Replace className="w-3.5 h-3.5" />
              <span>検索と置換 (Ctrl+H)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('find')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                activeTab === 'find'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>検索 (Ctrl+F)</span>
            </button>
          </div>
          <button
            type="button"
            id="btn-close-find-replace"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-[#242A35] rounded-md transition-colors cursor-pointer"
            title="閉じる (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* モーダルボディ */}
        <div className="p-5 space-y-4">
          {/* 検索入力欄 */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
              検索文字列 (Find):
            </label>
            <div
              className={`flex items-center bg-gray-50 dark:bg-[#0F1115] border rounded-lg px-3 py-2 transition-colors ${
                regexError
                  ? 'border-red-500 ring-1 ring-red-500'
                  : 'border-gray-300 dark:border-[#374151] focus-within:border-blue-500'
              }`}
            >
              <Search className="w-4 h-4 text-gray-400 mr-2 shrink-0" />
              <input
                id="input-modal-find"
                ref={queryInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={useRegex ? '正規表現パターン (例: (\\d{3})-(\\d{4}))' : '検索キーワード...'}
                className="w-full bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none font-mono"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {regexError && (
              <div className="flex items-center gap-1 text-[11px] text-red-500 font-medium pt-0.5">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span>{regexError}</span>
              </div>
            )}
          </div>

          {/* 置換入力欄（置換タブ時） */}
          {activeTab === 'replace' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                置換文字列 (Replace with):
              </label>
              <div className="flex items-center bg-gray-50 dark:bg-[#0F1115] border border-gray-300 dark:border-[#374151] focus-within:border-blue-500 rounded-lg px-3 py-2 transition-colors">
                <Replace className="w-4 h-4 text-blue-500 mr-2 shrink-0" />
                <input
                  id="input-modal-replace"
                  ref={replaceInputRef}
                  type="text"
                  value={replacement}
                  onChange={(e) => setReplacement(e.target.value)}
                  placeholder={useRegex ? '置換テキスト (キャプチャ参照: $1, $2 等)' : '置換後テキスト...'}
                  className="w-full bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none font-mono"
                />
                {replacement && (
                  <button
                    type="button"
                    onClick={() => setReplacement('')}
                    className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 検索・置換オプション */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-200 dark:border-[#2D3139]">
            <div className="flex items-center gap-3">
              {/* 大文字小文字区別 */}
              <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={caseSensitive}
                  onChange={(e) => setCaseSensitive(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-semibold">大文字/小文字を区別 (Aa)</span>
              </label>

              {/* 正規表現 */}
              <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useRegex}
                  onChange={(e) => setUseRegex(e.target.checked)}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <span className="font-semibold font-mono text-purple-600 dark:text-purple-400">正規表現 (.*)</span>
              </label>
            </div>

            {/* 対象列セレクタ */}
            {metadata && metadata.headers.length > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <span className="text-gray-500 dark:text-gray-400">対象列:</span>
                <select
                  value={columnFilter !== null ? columnFilter : ''}
                  onChange={(e) => setColumnFilter(e.target.value === '' ? null : parseInt(e.target.value, 10))}
                  className="bg-gray-100 dark:bg-[#1A1D23] border border-gray-300 dark:border-[#2D3139] rounded px-2 py-1 text-xs text-gray-800 dark:text-gray-200 focus:outline-none max-w-[130px] truncate cursor-pointer"
                >
                  <option value="">すべての列 (全域)</option>
                  {metadata.headers.map((h, idx) => (
                    <option key={idx} value={idx}>
                      列 {idx + 1}: {h}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 正規表現キャプチャグループのヒント */}
          {useRegex && activeTab === 'replace' && (
            <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/40 text-[11px] text-purple-700 dark:text-purple-300 flex items-start gap-2">
              <Sparkles className="w-4 h-4 shrink-0 text-purple-600 dark:text-purple-400 mt-0.5" />
              <div>
                <span className="font-bold">キャプチャグループ置換の例:</span>
                <p className="mt-0.5 text-purple-600 dark:text-purple-400 font-mono">
                  検索: <code className="bg-purple-100 dark:bg-purple-900/50 px-1 py-0.5 rounded">(\d&#123;3&#125;)(\d&#123;4&#125;)</code> → 置換: <code className="bg-purple-100 dark:bg-purple-900/50 px-1 py-0.5 rounded">$1-$2</code>
                </p>
              </div>
            </div>
          )}

          {/* ステータス / フィードバック表示 */}
          {statusMessage && (
            <div
              className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                statusMessage.type === 'success'
                  ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-900/40'
                  : statusMessage.type === 'error'
                  ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/40'
                  : 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/40'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600 dark:text-green-400" />
              ) : statusMessage.type === 'error' ? (
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
              ) : (
                <Search className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
              )}
              <span className="font-medium">{statusMessage.text}</span>
            </div>
          )}
        </div>

        {/* モーダルフッター（アクションボタン） */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 bg-gray-100 dark:bg-[#1A1D23] border-t border-gray-200 dark:border-[#2D3139]">
          <div className="flex items-center gap-1.5">
            <button
              id="btn-modal-find-prev"
              type="button"
              onClick={handleFindPrev}
              disabled={!query || !!regexError || isProcessing}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#242A35] hover:bg-gray-100 dark:hover:bg-[#2F3644] text-xs font-semibold text-gray-800 dark:text-gray-200 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer shadow-2xs"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              <span>前を検索</span>
            </button>
            <button
              id="btn-modal-find-next"
              type="button"
              onClick={handleFindNext}
              disabled={!query || !!regexError || isProcessing}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#242A35] hover:bg-gray-100 dark:hover:bg-[#2F3644] text-xs font-semibold text-gray-800 dark:text-gray-200 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer shadow-2xs"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              <span>次を検索</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'replace' && (
              <>
                <button
                  id="btn-modal-replace-current"
                  type="button"
                  onClick={handleReplaceCurrent}
                  disabled={!query || !!regexError || isProcessing}
                  className="px-3.5 py-1.5 rounded-lg border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#242A35] hover:bg-gray-100 dark:hover:bg-[#2F3644] text-xs font-bold text-gray-800 dark:text-gray-200 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer shadow-2xs"
                  title="現在の一致セルを置換して次の一致へ移動"
                >
                  置換
                </button>
                <button
                  id="btn-modal-replace-all"
                  type="button"
                  onClick={handleReplaceAll}
                  disabled={!query || !!regexError || isProcessing}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white transition-colors cursor-pointer shadow-sm active:scale-98 disabled:opacity-40 disabled:pointer-events-none"
                  title="全一致セルを一括置換（Ctrl+Zで一括巻き戻し可能）"
                >
                  すべて置換
                </button>
              </>
            )}
            <button
              id="btn-modal-close"
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-gray-300 dark:border-[#374151] bg-transparent hover:bg-gray-200 dark:hover:bg-[#242A35] text-xs font-medium text-gray-700 dark:text-gray-300 transition-colors cursor-pointer"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
