export const ROW_HEIGHT = 30; // 1行あたりの固定高さ (px)
export const ROW_NUM_WIDTH = 68; // 行番号列の固定幅 (px)
export const OVERSCAN_ROWS = 15; // 縦方向の予備描画行数 (上下15行 = 約450px)
export const OVERSCAN_COLS = 3; // 横方向の予備描画列数 (左右3列)
export const CHUNK_SIZE = 2000; // 1回のIPCで取得するチャンク行数 (2,000行ブロック)
export const MAX_CACHED_ROWS = 100000; // メモリ保持する最大行数 (10万行 = 約10MB〜20MBの快適メモリ展開)
export const DEFAULT_COL_WIDTH = 160;
export const MIN_COL_WIDTH = 60;
