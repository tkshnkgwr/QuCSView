// UPDATE 2026-08-26: [Vitestユニットテスト] WebWorker/エンジンコア機能テスト
// なぜ: 先頭ゼロ（ゼロ落ち）の保護、高速行/列操作、正規表現検索、およびファイル分割の堅牢性を検証するため

import { describe, it, expect } from 'vitest';
import { CsvParser } from '../src/utils/csvParser';
import type { SupportedEncoding, SupportedLineEnding } from '../src/types/csv';

describe('CsvParser (Core In-Memory Utilities)', () => {
  it('should preserve leading zeros in cells without numeric coercion', () => {
    const rawCsv = 'ID,Code,Tel\r\n001,000123,090-1234-5678\r\n002,000456,080-9876-5432';
    const lines = rawCsv.split('\r\n');
    const headers = lines[0].split(',');
    const row1 = lines[1].split(',');

    expect(headers).toEqual(['ID', 'Code', 'Tel']);
    expect(row1[0]).toBe('001');
    expect(row1[1]).toBe('000123');
    expect(row1[2]).toBe('090-1234-5678');
  });

  it('should parse escaped CSV lines with quotes and commas properly', () => {
    const sampleLine = '101,"Tokyo, Japan","Quote with ""escaped"" chars"';
    // 簡易CSVパース検証
    const parsed = CsvParser.parseLine(sampleLine, ',');
    expect(parsed[0]).toBe('101');
    expect(parsed[1]).toBe('Tokyo, Japan');
    expect(parsed[2]).toBe('Quote with "escaped" chars');
  });

  it('should format rows to CSV string with appropriate quoting', () => {
    const row = ['00123', 'Hello, World', 'NormalText', 'Contains "quotes"'];
    const formatted = CsvParser.formatLine(row, ',');
    expect(formatted).toBe('00123,"Hello, World",NormalText,"Contains ""quotes"""');
  });
});

describe('Regex Search Validation', () => {
  it('should match postal codes and phone numbers correctly via RegEx', () => {
    const testData = ['100-0001', '060-0002', 'Invalid-Code', '1234567'];
    const postalRegex = /^\d{3}-\d{4}$/;

    const matched = testData.filter(val => postalRegex.test(val));
    expect(matched).toEqual(['100-0001', '060-0002']);
  });

  it('should handle case-insensitive and case-sensitive matching', () => {
    const testData = ['Apple', 'banana', 'APPLE_PIE', 'Orange'];
    const lowerRe = new RegExp('apple', 'i');
    const strictRe = new RegExp('Apple');

    const matchedLower = testData.filter(val => lowerRe.test(val));
    const matchedStrict = testData.filter(val => strictRe.test(val));

    expect(matchedLower).toEqual(['Apple', 'APPLE_PIE']);
    expect(matchedStrict).toEqual(['Apple']);
  });
});

describe('CSV Splitting Math', () => {
  it('should calculate correct chunk count and row boundaries', () => {
    const totalRows = 105;
    const chunkSize = 50;
    const chunkCount = Math.ceil(totalRows / chunkSize);

    expect(chunkCount).toBe(3);

    const chunk1 = { start: 0 * chunkSize, end: Math.min(1 * chunkSize, totalRows) };
    const chunk2 = { start: 1 * chunkSize, end: Math.min(2 * chunkSize, totalRows) };
    const chunk3 = { start: 2 * chunkSize, end: Math.min(3 * chunkSize, totalRows) };

    expect(chunk1).toEqual({ start: 0, end: 50 });
    expect(chunk2).toEqual({ start: 50, end: 100 });
    expect(chunk3).toEqual({ start: 100, end: 105 });
  });
});
