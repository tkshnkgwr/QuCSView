// UPDATE 2026-08-26: [大規模データ対応の高速ファイル分割（行数指定）モーダル]
// なぜ: 数万〜数百件以上の大規模CSV/TSVを、指定行数（例: 1,000行/10,000行）ごとにヘッダーを維持したまま瞬時に分割エクスポートするため。
import React, { useState } from 'react';
import {
  X,
  Split,
  FileText,
  Download,
  CheckCircle2,
  AlertCircle,
  Hash,
} from 'lucide-react';
import {
  FileMetadata,
  SupportedEncoding,
  SupportedLineEnding,
} from '../types/csv';
import { TauriBridge } from '../services/tauriBridge';

interface SplitModalProps {
  isOpen: boolean;
  onClose: () => void;
  metadata: FileMetadata | null;
}

export const SplitModal: React.FC<SplitModalProps> = ({
  isOpen,
  onClose,
  metadata,
}) => {
  const [chunkRows, setChunkRows] = useState<number>(10000);
  const [includeHeader, setIncludeHeader] = useState<boolean>(true);
  const [prefix, setPrefix] = useState<string>('');
  const [encoding, setEncoding] = useState<SupportedEncoding>(metadata?.encoding || 'UTF-8');
  const [lineEnding, setLineEnding] = useState<SupportedLineEnding>(metadata?.lineEnding || 'CRLF');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{
    totalChunks: number;
    totalRows: number;
    chunks: Array<{ fileName: string; rowCount: number; bytes: Uint8Array; text: string }>;
  } | null>(null);

  if (!isOpen || !metadata) return null;

  const totalRows = metadata.totalRows;
  const estimatedChunks = Math.max(1, Math.ceil(totalRows / (chunkRows || 1)));
  const defaultPrefix = metadata.fileName.replace(/\.[^/.]+$/, '');

  const handleExecuteSplit = async () => {
    setIsProcessing(true);
    setResult(null);
    try {
      const res = await TauriBridge.splitFile({
        chunkRows: Number(chunkRows) || 10000,
        includeHeader,
        prefix: prefix.trim() || defaultPrefix,
        encoding,
        lineEnding,
      });
      setResult(res);
    } catch (err: any) {
      alert(`分割エラー: ${err.message || String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadChunk = (chunk: { fileName: string; bytes: Uint8Array; text: string }) => {
    const isTsv = chunk.fileName.toLowerCase().endsWith('.tsv') || metadata.delimiter === '\t';
    const charsetMap: Record<SupportedEncoding, string> = {
      'UTF-8': 'utf-8',
      'UTF-8 BOM': 'utf-8',
      'Shift_JIS': 'shift_jis',
      'EUC-JP': 'euc-jp',
    };
    const mimeType = isTsv
      ? `text/tab-separated-values;charset=${charsetMap[encoding] || 'utf-8'};`
      : `text/csv;charset=${charsetMap[encoding] || 'utf-8'};`;

    const blob = new Blob([chunk.bytes || chunk.text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = chunk.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = async () => {
    if (!result) return;
    for (let i = 0; i < result.chunks.length; i++) {
      handleDownloadChunk(result.chunks[i]);
      // ブラウザの同時ダウンロードブロックを防ぐため微小ウェイト
      await new Promise((r) => setTimeout(r, 120));
    }
  };

  return (
// UPDATE 2026-08-26: [ライト/ダーク両対応ファイル分割モーダル]
// なぜ: 無効な light: 構文を除去し、分割モーダルのライトモード（デフォルト白基調）と dark: バリアントによるスタイリングを完全適用するため
    <div
      id="modal-split-file"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 font-mono select-none"
    >
      <div className="bg-white dark:bg-[#14171C] border border-gray-300 dark:border-[#2D3139] rounded-lg shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-[#2D3139] bg-gray-100 dark:bg-[#1E232B]">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-gray-100">
            <Split className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>CSV / TSV ファイル分割（行数指定）</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 dark:hover:text-white transition-colors p-1 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 本文 */}
        <div className="p-4 space-y-4 text-xs overflow-y-auto flex-1">
          {/* ファイル概要 */}
          <div className="bg-gray-50 dark:bg-[#0F1115] p-3 rounded border border-gray-200 dark:border-[#2D3139] space-y-1">
            <div className="flex justify-between text-gray-700 dark:text-gray-300">
              <span className="text-gray-500">対象ファイル:</span>
              <span className="font-semibold truncate max-w-[280px] text-gray-900 dark:text-gray-100">{metadata.fileName}</span>
            </div>
            <div className="flex justify-between text-gray-700 dark:text-gray-300">
              <span className="text-gray-500">総データ行数:</span>
              <span className="font-bold text-blue-600 dark:text-blue-400">{totalRows.toLocaleString()} 行</span>
            </div>
          </div>

          {/* 分割行数設定 */}
          <div>
            <label className="block text-gray-800 dark:text-gray-300 font-semibold mb-1">
              1ファイルあたりの分割行数（チャンクサイズ）:
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="number"
                  min={1}
                  max={totalRows || 10000000}
                  value={chunkRows}
                  onChange={(e) => setChunkRows(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-[#0F1115] border border-gray-300 dark:border-[#374151] rounded text-gray-900 dark:text-gray-100 font-bold focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>
              <div className="flex gap-1">
                {[1000, 5000, 10000, 50000].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setChunkRows(preset)}
                    className="px-2 py-1 rounded bg-gray-200 dark:bg-[#1E232B] hover:bg-gray-300 dark:hover:bg-[#2D3139] text-gray-800 dark:text-gray-300 text-[11px]"
                  >
                    {preset >= 10000 ? `${preset / 10000}万` : preset}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 flex justify-between">
              <span>予想分割ファイル数:</span>
              <span className="font-bold text-purple-600 dark:text-purple-400">約 {estimatedChunks} ファイル</span>
            </div>
          </div>

          {/* 出力接頭辞 */}
          <div>
            <label className="block text-gray-800 dark:text-gray-300 font-semibold mb-1">
              出力ファイル名プレフィックス:
            </label>
            <input
              type="text"
              placeholder={defaultPrefix}
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              className="w-full px-3 py-1.5 bg-white dark:bg-[#0F1115] border border-gray-300 dark:border-[#374151] rounded text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 text-xs"
            />
            <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
              例: <span className="text-gray-700 dark:text-gray-300 font-semibold">{prefix.trim() || defaultPrefix}_part001.csv</span>
            </div>
          </div>

          {/* オプション */}
          <div className="space-y-2 pt-1 border-t border-gray-200 dark:border-[#2D3139]">
            <label className="flex items-center gap-2 cursor-pointer text-gray-800 dark:text-gray-300">
              <input
                type="checkbox"
                checked={includeHeader}
                onChange={(e) => setIncludeHeader(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 dark:border-[#374151] bg-white dark:bg-[#0F1115] text-blue-600"
              />
              <span className="font-medium">全分割ファイルの先頭にヘッダー行を付与する</span>
            </label>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="block text-gray-600 dark:text-gray-400 mb-0.5 text-[11px]">文字コード:</label>
                <select
                  value={encoding}
                  onChange={(e) => setEncoding(e.target.value as SupportedEncoding)}
                  className="w-full px-2 py-1 bg-white dark:bg-[#0F1115] border border-gray-300 dark:border-[#374151] rounded text-gray-800 dark:text-gray-200 text-[11px]"
                >
                  <option value="UTF-8">UTF-8</option>
                  <option value="UTF-8 BOM">UTF-8 (BOM有)</option>
                  <option value="Shift_JIS">Shift_JIS (CP932)</option>
                  <option value="EUC-JP">EUC-JP</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-600 dark:text-gray-400 mb-0.5 text-[11px]">改行コード:</label>
                <select
                  value={lineEnding}
                  onChange={(e) => setLineEnding(e.target.value as SupportedLineEnding)}
                  className="w-full px-2 py-1 bg-white dark:bg-[#0F1115] border border-gray-300 dark:border-[#374151] rounded text-gray-800 dark:text-gray-200 text-[11px]"
                >
                  <option value="CRLF">CRLF (Windows)</option>
                  <option value="LF">LF (Unix/Mac)</option>
                </select>
              </div>
            </div>
          </div>

          {/* 分割結果リスト */}
          {result && (
            <div className="bg-purple-50 dark:bg-[#0F1115] p-3 rounded border border-purple-300 dark:border-purple-800/40 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-purple-900 dark:text-purple-300 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>分割完了: {result.totalChunks} ファイル生成</span>
                </div>
                <button
                  onClick={handleDownloadAll}
                  className="flex items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white px-2.5 py-1 rounded text-[11px] font-bold shadow-xs transition-colors"
                >
                  <Download className="w-3 h-3" />
                  <span>一括ダウンロード</span>
                </button>
              </div>

              <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                {result.chunks.map((chunk, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-1.5 bg-white dark:bg-[#14171C] rounded border border-gray-200 dark:border-[#2D3139] text-[11px]"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <FileText className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                      <span className="font-semibold truncate text-gray-900 dark:text-gray-100">{chunk.fileName}</span>
                      <span className="text-gray-500 dark:text-gray-400">({chunk.rowCount.toLocaleString()}行)</span>
                    </div>
                    <button
                      onClick={() => handleDownloadChunk(chunk)}
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-semibold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/40 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors"
                    >
                      DL
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-[#2D3139] bg-gray-100 dark:bg-[#1E232B] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-gray-200 dark:bg-[#0F1115] hover:bg-gray-300 dark:hover:bg-[#2A313C] text-gray-800 dark:text-gray-300 text-xs transition-colors"
          >
            閉じる
          </button>
          <button
            onClick={handleExecuteSplit}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs shadow-xs transition-colors"
          >
            <Split className="w-3.5 h-3.5" />
            <span>{isProcessing ? '分割中...' : 'ファイル分割を実行'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
