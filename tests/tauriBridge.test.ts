// UPDATE 2026-08-26: [Vitestユニットテスト] TauriBridge および環境判定テスト
// なぜ: Tauriデスクトップ環境とWebブラウザ環境の切り替え、およびIPC呼び出しインターフェースの整合性を検証するため

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isTauriEnv } from '../src/services/tauriBridge';

describe('TauriBridge Environment Detection', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    (globalThis as any).window = {};
  });

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  it('should return false when running in standard Web browser (no __TAURI_INTERNALS__)', () => {
    expect(isTauriEnv()).toBe(false);
  });

  it('should return true when window.__TAURI_INTERNALS__ is present', () => {
    (globalThis as any).window.__TAURI_INTERNALS__ = {};
    expect(isTauriEnv()).toBe(true);
  });

  it('should return true when window.__TAURI__ is present', () => {
    (globalThis as any).window.__TAURI__ = {};
    expect(isTauriEnv()).toBe(true);
  });
});

