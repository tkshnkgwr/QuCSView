// UPDATE 2026-08-20: [テーマ管理フック] ライト/ダーク/OSシステム連動のテーマ管理と永続化
import { useState, useEffect } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

export function useTheme() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('qucsv_theme');
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
      }
    } catch {
      // localStorage is unavailable
    }
    return 'dark'; // デフォルトは低負荷・高視認性ダーク
  });

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      let isDark = true;
      if (themeMode === 'system') {
        isDark = mediaQuery.matches;
      } else {
        isDark = themeMode === 'dark';
      }

      setResolvedTheme(isDark ? 'dark' : 'light');

      const root = document.documentElement;
      if (isDark) {
        root.classList.add('dark');
        root.classList.remove('light');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.remove('dark');
        root.classList.add('light');
        root.style.colorScheme = 'light';
      }
    };

    applyTheme();

    const handler = () => {
      if (themeMode === 'system') {
        applyTheme();
      }
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [themeMode]);

  const changeTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
    try {
      localStorage.setItem('qucsv_theme', mode);
    } catch {
      // ignore
    }
  };

// UPDATE 2026-08-20: [テーマ操作API統一] setThemeMode と changeTheme の両方の命名をエクスポート
  return {
    themeMode,
    resolvedTheme,
    changeTheme,
    setThemeMode: changeTheme,
  };
}
