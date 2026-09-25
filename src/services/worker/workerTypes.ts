import { SupportedEncoding } from '../../types/csv';

export interface WorkerState {
  rawBuffer: ArrayBuffer | null;
  rawBytes: Uint8Array | null;
  fileName: string;
  fileSize: number;
  rawLines: string[];
  hasHeader: boolean;
  lines: string[];
  headers: string[];       // 表示用（空フィールドは "Col N" または連番に置換済み）
  rawHeaders: string[];    // 元の値（空文字列のまま保持・テキスト再構築用）
  delimiter: string;
  encoding: SupportedEncoding;
  lineEnding: string;
  modifiedCells: Map<string, string>; // "row,col" -> value
}
