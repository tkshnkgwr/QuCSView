import Encoding from 'encoding-japanese';
import { SupportedEncoding } from '../../types/csv';

/**
 * バイナリバイト列から高精度に文字コードを自動判定
 */
export function detectEncoding(bytes: Uint8Array): SupportedEncoding {
  // 1. UTF-8 BOM (0xEF, 0xBB, 0xBF)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return 'UTF-8 BOM';
  }

  // 判定用サンプル（最大64KB）
  const sample = bytes.slice(0, Math.min(bytes.length, 65536));

  // 2. encoding-japanese による検出
  const detected = Encoding.detect(sample);
  if (detected === 'SJIS') return 'Shift_JIS';
  if (detected === 'EUCJP') return 'EUC-JP';
  if (detected === 'UTF8') return 'UTF-8';

  // 3. TextDecoder UTF-8 厳密検証フォールバック
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    utf8Decoder.decode(sample);
    return 'UTF-8';
  } catch {
    return 'Shift_JIS';
  }
}

/**
 * 指定文字コードに基づきバイト列を文字列へ安全デコード
 */
export function decodeBytes(bytes: Uint8Array, encoding: SupportedEncoding): string {
  let targetBytes = bytes;

  // UTF-8 BOMの場合は先頭3バイトを除去
  if (
    (encoding === 'UTF-8 BOM' || encoding === 'UTF-8') &&
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    targetBytes = bytes.slice(3);
  }

  try {
    if (encoding === 'Shift_JIS') {
      try {
        return new TextDecoder('shift_jis').decode(targetBytes);
      } catch {
        const unicodeArray = Encoding.convert(targetBytes, { to: 'UNICODE', from: 'SJIS' });
        return Encoding.codeToString(unicodeArray);
      }
    } else if (encoding === 'EUC-JP') {
      try {
        return new TextDecoder('euc-jp').decode(targetBytes);
      } catch {
        const unicodeArray = Encoding.convert(targetBytes, { to: 'UNICODE', from: 'EUCJP' });
        return Encoding.codeToString(unicodeArray);
      }
    } else {
      return new TextDecoder('utf-8').decode(targetBytes);
    }
  } catch (err) {
    console.warn(`TextDecoder failed for ${encoding}, falling back to encoding-japanese:`, err);
    const unicodeArray = Encoding.convert(targetBytes, { to: 'UNICODE', from: 'AUTO' });
    return Encoding.codeToString(unicodeArray);
  }
}

/**
 * 文字列を指定文字コードのバイト列へエンコード
 */
export function encodeToBytes(text: string, encoding: SupportedEncoding): Uint8Array {
  if (encoding === 'Shift_JIS') {
    const sjisArray = Encoding.convert(Encoding.stringToCode(text), {
      to: 'SJIS',
      from: 'UNICODE',
    });
    return new Uint8Array(sjisArray);
  } else if (encoding === 'EUC-JP') {
    const eucArray = Encoding.convert(Encoding.stringToCode(text), {
      to: 'EUCJP',
      from: 'UNICODE',
    });
    return new Uint8Array(eucArray);
  } else if (encoding === 'UTF-8 BOM') {
    const utf8Bytes = new TextEncoder().encode(text);
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const combined = new Uint8Array(bom.length + utf8Bytes.length);
    combined.set(bom, 0);
    combined.set(utf8Bytes, bom.length);
    return combined;
  } else {
    return new TextEncoder().encode(text);
  }
}
