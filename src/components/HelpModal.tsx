// UPDATE 2026-08-26: [ヘルプモーダルに「表/テキスト表示切替」及び「未保存セル色分け」の説明とショートカットを追加]
// なぜ: 新規追加されたCSVプレビュー・テキスト表示切替ボタン、未保存セルのアンバー色ハイライト表示、および直接テキスト編集機能をユーザーが直感的に理解できるようにするため。
import React, { useState, useEffect } from 'react';
import {
  X,
  Keyboard,
  ShieldCheck,
  Zap,
  Info,
  FileSpreadsheet,
  BookOpen,
  HelpCircle,
  Sparkles,
  MousePointerClick,
  CheckCircle2,
  FileText,
  Search,
  Save,
  Cpu,
  Copy,
  Binary,
  Code,
  Edit3,
} from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  key: string;
  description: string;
  category: 'ファイル操作' | 'ナビゲーション・検索' | 'セル編集・選択';
}

const SHORTCUTS: ShortcutItem[] = [
  { key: 'Ctrl + Z', description: '操作を元に戻す (Undo: セル編集・行/列の追加・複製・削除)', category: 'セル編集・選択' },
  { key: 'Ctrl + Y / Ctrl + Shift + Z', description: '操作をやり直す (Redo)', category: 'セル編集・選択' },
  { key: '右クリック (セル/行番号/ヘッダ)', description: '行・列の挿入 / 複製 / 削除コンテキストメニューを表示', category: 'セル編集・選択' },
  { key: 'Ctrl + O', description: 'ファイルを開く（CSV / TSV）', category: 'ファイル操作' },
  { key: 'Ctrl + S', description: '上書き保存（現在の文字コード・改行コードで直書き）', category: 'ファイル操作' },
  { key: 'Ctrl + Shift + S', description: '名前を付けて保存（別名エクスポート）', category: 'ファイル操作' },
  { key: 'Ctrl + C', description: '選択セル範囲 / 選択行をTSV形式でクリップボードにコピー', category: 'セル編集・選択' },
  { key: 'Ctrl + V', description: 'クリップボードの2次元TSV/CSVデータを矩形貼り付け (Undo対応)', category: 'セル編集・選択' },
  { key: '列境界ダブルクリック', description: '列ヘッダー境界をダブルクリックして内容幅に自動調整 (Auto-Fit)', category: 'セル編集・選択' },
  { key: 'Ctrl + A', description: 'テーブル内の全セルを選択', category: 'セル編集・選択' },
  { key: 'Shift + クリック / 矢印', description: 'セル範囲の拡張選択（複数行・複数列）', category: 'セル編集・選択' },
  { key: 'Ctrl + F', description: '全文検索バーにフォーカス', category: 'ナビゲーション・検索' },
  { key: 'Ctrl + H', description: '検索と置換ダイアログを開く（正規表現・キャプチャ置換対応）', category: 'ナビゲーション・検索' },
  { key: 'Enter (検索時)', description: '次の一致セルへジャンプ', category: 'ナビゲーション・検索' },
  { key: 'Shift + Enter (検索時)', description: '前の一致セルへジャンプ', category: 'ナビゲーション・検索' },
  { key: 'F1', description: 'ヘルプ＆ショートカット一覧を開く', category: 'ナビゲーション・検索' },
  { key: 'Esc', description: '検索バー / ヘルプモーダルを閉じる', category: 'ナビゲーション・検索' },
  { key: 'セルダブルクリック / F2 / Enter', description: 'インプレース直接セル編集を開始（未保存箇所は保存までアンバー色で強調）', category: 'セル編集・選択' },
  { key: 'Enter / Tab (編集時)', description: '編集内容を確定して次セル（下 / 右）へ移動', category: 'セル編集・選択' },
  { key: 'Shift + Tab (編集時)', description: '編集内容を確定して前のセル（左）へ移動', category: 'セル編集・選択' },
  { key: 'Esc (編集時)', description: '編集をキャンセル（元の値に戻す）', category: 'セル編集・選択' },
  { key: '↑ / ↓ / ← / →', description: 'アクティブセルの移動', category: 'セル編集・選択' },
  { key: 'PageUp / PageDown', description: 'ページ単位の高速スクロール', category: 'セル編集・選択' },
];

type TabType = 'overview' | 'features' | 'guide' | 'shortcuts' | 'faq';

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
// UPDATE 2026-08-26: [ライト/ダーク両対応ヘルプモーダル]
// なぜ: 無効な light: 構文を除去し、ヘルプモーダルのライトモード（デフォルト白基調）と dark: バリアントによるスタイリングを完全適用するため
    <div
      id="qu-help-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px] p-4 font-mono text-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="qu-help-modal-dialog"
        className="w-full max-w-3xl bg-white dark:bg-[#1A1D23] border border-gray-300 dark:border-[#374151] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[88vh] text-gray-900 dark:text-[#E5E7EB]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-[#2D3139] bg-gray-100 dark:bg-[#14171C]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-100 dark:bg-blue-600/20 rounded text-blue-600 dark:text-blue-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm text-gray-900 dark:text-gray-100">
                  QuCSView ヘルプ＆ガイド
                </h2>
                <span className="text-[10px] font-medium px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-600/30 rounded">
                  v0.2.0 Desktop Engine
                </span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                超軽量・低負荷・型破壊ゼロの高速CSV/TSVビューアー＆エディタ
              </p>
            </div>
          </div>
          <button
            id="btn-close-help-modal"
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-[#2D3139] rounded transition-colors"
            title="閉じる (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ナビゲーションタブ */}
        <div className="flex items-center border-b border-gray-200 dark:border-[#2D3139] bg-gray-50 dark:bg-[#101317] px-3 gap-1 overflow-x-auto">
          <button
            id="tab-help-overview"
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'overview'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-[#1A1D23]'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            <span>概要と開発コンセプト</span>
          </button>
          <button
            id="tab-help-features"
            onClick={() => setActiveTab('features')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'features'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-[#1A1D23]'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>主な特徴・メリット</span>
          </button>
          <button
            id="tab-help-guide"
            onClick={() => setActiveTab('guide')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'guide'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-[#1A1D23]'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>使い方ガイド</span>
          </button>
          <button
            id="tab-help-shortcuts"
            onClick={() => setActiveTab('shortcuts')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'shortcuts'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-[#1A1D23]'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>ショートカット一覧</span>
          </button>
          <button
            id="tab-help-faq"
            onClick={() => setActiveTab('faq')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'faq'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-[#1A1D23]'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>FAQ・仕様</span>
          </button>
        </div>

        {/* コンテンツエリア */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {/* 1. 概要タブ */}
          {activeTab === 'overview' && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div className="p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-[#2D3139] rounded">
                <h3 className="font-bold text-gray-900 dark:text-gray-200 mb-1.5 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  QuCSView とは？
                </h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  <strong>QuCSView</strong> は、低スペックPC（メモリ4GB〜・Windows PC）でも<strong>500MB超（数百〜数千万行）</strong>の巨大CSV/TSVファイルを瞬時にプレビュー・検索・直接編集するために開発されたデスクトップ向け超高速CSVツールです。
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                <div className="p-3 bg-white dark:bg-[#14171C] border border-gray-200 dark:border-[#2D3139] rounded">
                  <div className="text-emerald-600 dark:text-emerald-400 font-bold mb-1 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>型破壊ゼロ</span>
                  </div>
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-normal">
                    すべての値をプレーンテキスト（生文字列）として厳格に扱い、元のコード値や書式を一切破壊しません。
                  </p>
                </div>

                <div className="p-3 bg-white dark:bg-[#14171C] border border-gray-200 dark:border-[#2D3139] rounded">
                  <div className="text-blue-600 dark:text-blue-400 font-bold mb-1 flex items-center gap-1.5">
                    <Zap className="w-4 h-4" />
                    <span>高速仮想スライス</span>
                  </div>
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-normal">
                    100万行を超える大容量データでも画面内の行（30〜50行）のみをオンデマンド描画し、60FPSのスムーズなスクロールを実現。
                  </p>
                </div>

                <div className="p-3 bg-white dark:bg-[#14171C] border border-gray-200 dark:border-[#2D3139] rounded">
                  <div className="text-purple-600 dark:text-purple-400 font-bold mb-1 flex items-center gap-1.5">
                    <Cpu className="w-4 h-4" />
                    <span>超低負荷・低メモリ</span>
                  </div>
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-normal">
                    Rustメモリマップインデックス技術により、大容量ファイル展開時でもメモリ使用量を数十MBに抑制します。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 2. 主な特徴タブ */}
          {activeTab === 'features' && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-[#2D3139] rounded">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                    <ShieldCheck className="w-4 h-4" />
                    <span>1. Excel型破壊の完全排除</span>
                  </div>
                  <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed">
                    先頭の <code className="text-gray-800 dark:text-gray-200 bg-gray-200 dark:bg-[#1A1D23] px-1 py-0.2 rounded font-mono">00123</code>（商品コード・郵便番号）の消失や、<code className="text-gray-800 dark:text-gray-200 bg-gray-200 dark:bg-[#1A1D23] px-1 py-0.2 rounded font-mono">1-2-3</code> の勝手な日付化、<code className="text-gray-800 dark:text-gray-200 bg-gray-200 dark:bg-[#1A1D23] px-1 py-0.2 rounded font-mono">1.23E+11</code> のような指数表記変換を100%阻止します。
                  </p>
                </div>

                <div className="p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-[#2D3139] rounded">
                  <div className="flex items-center gap-1.5 font-bold text-blue-600 dark:text-blue-400 mb-1">
                    <Zap className="w-4 h-4" />
                    <span>2. 500MB対応・仮想スライス描画</span>
                  </div>
                  <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed">
                    DOMノードを無駄に増やさず、表示領域のセルのみを瞬時に描画。数十万〜数百万行の大規模CSVでもブラウザやアプリがフリーズすることなく軽快に動作します。
                  </p>
                </div>

                <div className="p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-[#2D3139] rounded">
                  <div className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400 mb-1">
                    <MousePointerClick className="w-4 h-4" />
                    <span>3. 直感的な直接セル編集 & 選択行ハイライト</span>
                  </div>
                  <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed">
                    セルダブルクリックまたは <kbd className="font-mono bg-gray-200 dark:bg-[#1A1D23] px-1 py-0.2 rounded">Enter / F2</kbd> で即座にセル内直接編集が可能。左端の行番号をクリックすれば該当行全体が高視認性にハイライト選択されます。
                  </p>
                </div>

                <div className="p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-[#2D3139] rounded">
                  <div className="flex items-center gap-1.5 font-bold text-cyan-600 dark:text-cyan-400 mb-1">
                    <Copy className="w-4 h-4" />
                    <span>4. 選択範囲のクリップボードTSVコピー (Ctrl+C)</span>
                  </div>
                  <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed">
                    Shift+ドラッグやShift+矢印で自由なセル範囲を選択し、<kbd className="font-mono bg-gray-200 dark:bg-[#1A1D23] px-1 py-0.2 rounded">Ctrl + C</kbd> を押すだけでExcelやテキストエディタに直接貼り付け可能なTSV形式で高速コピーできます。
                  </p>
                </div>

                <div className="p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-[#2D3139] rounded">
                  <div className="flex items-center gap-1.5 font-bold text-teal-600 dark:text-teal-400 mb-1">
                    <Search className="w-4 h-4" />
                    <span>5. 正規表現（RegEx）対応の高速全文検索</span>
                  </div>
                  <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed">
                    検索バーの <code className="text-gray-800 dark:text-gray-200 bg-gray-200 dark:bg-[#1A1D23] px-1 py-0.2 rounded font-mono">.*</code> ボタンで正規表現モードをONに。電話番号やメールアドレスなどの複雑なパターンをWebWorkerで超高速検索し、セル内の一致部分を的確にハイライトします。
                  </p>
                </div>

                <div className="p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-[#2D3139] rounded">
                  <div className="flex items-center gap-1.5 font-bold text-rose-600 dark:text-rose-400 mb-1">
                    <Save className="w-4 h-4" />
                    <span>6. 多彩な文字コード・改行コード対応</span>
                  </div>
                  <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed">
                    UTF-8、Shift_JIS（CP932）、EUC-JP等の文字コード自動判定および手動切替に対応。CRLF / LFの改行コードを保持したまま上書き・別名保存が可能です。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 3. 使い方ガイドタブ */}
          {activeTab === 'guide' && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div className="p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-[#2D3139] rounded space-y-2">
                <div className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>STEP 1: CSV / TSV ファイルを開く</span>
                </div>
                <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed pl-5">
                  • 画面上部の「開く」ボタンを押すか、<kbd className="bg-gray-200 dark:bg-[#1A1D23] px-1 py-0.2 rounded font-mono">Ctrl + O</kbd> を押します。<br />
                  • または、CSV/TSVファイルをブラウザ画面上に<strong>直接ドラッグ＆ドロップ</strong>してください。
                </p>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-[#2D3139] rounded space-y-2">
                <div className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>STEP 2: セルの閲覧・範囲選択・TSVコピー</span>
                </div>
                <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed pl-5">
                  • 矢印キー（↑ ↓ ← →）またはクリックで自由にセル移動できます。<br />
                  • 左端の行番号をクリックすると対象行全体が選択されます。<br />
                  • Shiftキーを押しながらクリック/矢印、またはドラッグで複数セルの範囲選択が可能です。<br />
                  • 選択状態で <kbd className="bg-gray-200 dark:bg-[#1A1D23] px-1 py-0.2 rounded font-mono">Ctrl + C</kbd> を押すと、選択範囲を即座にTSV形式でクリップボードへコピーします。
                </p>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-[#2D3139] rounded space-y-2">
                <div className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>STEP 3: 全文検索・正規表現・絞込フィルタ</span>
                </div>
                <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed pl-5">
                  • <kbd className="bg-gray-200 dark:bg-[#1A1D23] px-1 py-0.2 rounded font-mono">Ctrl + F</kbd> で検索バーにフォーカス。<br />
                  • <code className="bg-gray-200 dark:bg-[#1A1D23] px-1 py-0.2 rounded font-mono">.*</code> ボタンを押して正規表現検索モードを有効化できます（例: <code className="text-yellow-600 dark:text-yellow-400 font-mono">\d{3}-\d{4}</code>）。<br />
                  • <kbd className="bg-gray-200 dark:bg-[#1A1D23] px-1 py-0.2 rounded font-mono">Enter / Shift + Enter</kbd> で前後の一致セルにジャンプします。<br />
                  • 検索バー横の「絞込（Filter）」ボタンを押すと一致する行のみを抽出表示できます。
                </p>
              </div>
            </div>
          )}

          {/* 4. ショートカットタブ */}
          {activeTab === 'shortcuts' && (
            <div className="space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-600 dark:text-gray-400 text-[11px]">
                  主要なキーボード操作一覧
                </span>
                <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">
                  全17ショートカット対応
                </span>
              </div>

              <div className="border border-gray-300 dark:border-[#2D3139] rounded overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-[#14171C] text-gray-600 dark:text-gray-400 border-b border-gray-300 dark:border-[#2D3139] text-[11px]">
                      <th className="py-1.5 px-3 font-semibold w-48">キー</th>
                      <th className="py-1.5 px-3 font-semibold w-28">分類</th>
                      <th className="py-1.5 px-3 font-semibold">動作内容</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-[#2D3139] text-[11px]">
                    {SHORTCUTS.map((item, index) => (
                      <tr
                        key={index}
                        className="hover:bg-gray-50 dark:hover:bg-[#20252E] transition-colors"
                      >
                        <td className="py-1.5 px-3 font-mono">
                          <kbd className="px-1.5 py-0.5 bg-white dark:bg-[#0F1115] border border-gray-300 dark:border-[#374151] rounded text-blue-600 dark:text-blue-400 font-bold shadow-xs">
                            {item.key}
                          </kbd>
                        </td>
                        <td className="py-1.5 px-3 text-gray-600 dark:text-gray-400">
                          {item.category}
                        </td>
                        <td className="py-1.5 px-3 text-gray-800 dark:text-gray-300">
                          {item.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. FAQ・仕様タブ */}
          {activeTab === 'faq' && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div className="p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-[#2D3139] rounded">
                <div className="font-bold text-gray-900 dark:text-gray-200 mb-1 flex items-center gap-1.5">
                  <span className="text-blue-600 dark:text-blue-400 font-bold">Q:</span>
                  <span>選択したセル範囲をExcelやスプレッドシートにコピー＆ペーストできますか？</span>
                </div>
                <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                  <strong className="text-gray-700 dark:text-gray-300">A:</strong> はい。選択範囲で <kbd className="font-mono bg-gray-200 dark:bg-[#1A1D23] px-1 py-0.2 rounded text-blue-600 dark:text-blue-400">Ctrl + C</kbd> を押すと、タブ区切り（TSV）形式でクリップボードにコピーされるため、ExcelやGoogleスプレッドシートにそのまま自然な格子状データとしてペーストできます。
                </p>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-[#2D3139] rounded">
                <div className="font-bold text-gray-900 dark:text-gray-200 mb-1 flex items-center gap-1.5">
                  <span className="text-blue-600 dark:text-blue-400 font-bold">Q:</span>
                  <span>正規表現（RegEx）検索で不正なパターンを入力した場合はどうなりますか？</span>
                </div>
                <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                  <strong className="text-gray-700 dark:text-gray-300">A:</strong> アプリがクラッシュすることは一切ありません。構文エラー時は検索バーに赤色のアウトラインとエラーメッセージが表示され、安全にタイピングを継続できます。
                </p>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-[#2D3139] rounded">
                <div className="font-bold text-gray-900 dark:text-gray-200 mb-1 flex items-center gap-1.5">
                  <span className="text-blue-600 dark:text-blue-400 font-bold">Q:</span>
                  <span>500MB級の大きなファイルを開いた時、PCのメモリを圧迫しませんか？</span>
                </div>
                <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                  <strong className="text-gray-700 dark:text-gray-300">A:</strong> 圧迫しません。Rustメモリマップ機能および仮想スライス描画により、500MB展開時でもメモリ消費量は数十MB程度に抑えられ、低スペックPCでも快適に動作します。
                </p>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-[#0F1115] border border-gray-200 dark:border-[#2D3139] rounded">
                <div className="font-bold text-gray-900 dark:text-gray-200 mb-1 flex items-center gap-1.5">
                  <span className="text-blue-600 dark:text-blue-400 font-bold">Q:</span>
                  <span>Shift_JIS (CP932) の古いCSVファイルを開くと文字化けしませんか？</span>
                </div>
                <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                  <strong className="text-gray-700 dark:text-gray-300">A:</strong> 文字コード自動判別機能により、Shift_JIS形式のまま安全に読み込みます。保存時もShift_JISを指定してそのまま上書き保存が可能です。
                </p>
              </div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-200 dark:border-[#2D3139] bg-gray-100 dark:bg-[#14171C] text-[11px] text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-gray-500" />
            <span>QuCSView Desktop Engine • MIT License</span>
          </div>
          <button
            id="btn-help-dialog-ok"
            onClick={onClose}
            className="px-3.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded font-semibold transition-colors shadow-xs"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
