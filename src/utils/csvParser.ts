// UPDATE 2026-08-26: [CSVパース・フォーマット共通ユーティリティ]
// なぜ: テキスト入出力時やエスケープ処理、クォート文字列の正確な分解を型安全に行い、ゼロ落ちを防止するため

import type { SupportedDelimiter } from '../types/csv';

/**
 * CSV / TSV 行文字列のパースおよびフォーマット用ユーティリティクラス
 */
export class CsvParser {
  /**
   * 単一行のCSV/TSV文字列をセルの配列に分割（RFC 4180準拠）
   * @param line パース対象の1行
   * @param delimiter 区切り文字 (カンマ、タブ等)
   * @returns セル文字列の配列
   */
  static parseLine(line: string, delimiter: SupportedDelimiter | string = ','): string[] {
    const cells: string[] = [];
    let current = '';
    let inQuote = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuote && line[i + 1] === '"') {
          current += '"';
          i++; // エスケープされたダブルクォートをスキップ
        } else {
          inQuote = !inQuote;
        }
      } else if (char === delimiter && !inQuote) {
        cells.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current);
    return cells;
  }

  /**
   * セル配列をCSV/TSVの1行文字列にフォーマット（必要に応じてエスケープクォート付与）
   * @param cells セル文字列の配列
   * @param delimiter 区切り文字
   * @returns フォーマットされた1行
   */
  static formatLine(cells: string[], delimiter: SupportedDelimiter | string = ','): string {
    return cells
      .map(cell => {
        if (
          cell.includes(delimiter) ||
          cell.includes('"') ||
          cell.includes('\n') ||
          cell.includes('\r')
        ) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      })
      .join(delimiter);
  }
}
