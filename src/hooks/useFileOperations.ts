import React, { useCallback } from 'react';
import {
  FileMetadata,
  SupportedEncoding,
  SupportedLineEnding,
  SupportedDelimiter,
  CellCoordinate,
  ViewMode,
  RecentFile,
  SearchState,
} from '../types/csv';
import { TauriBridge, isTauriEnv } from '../services/tauriBridge';
import { addRecentFile, clearRecentFiles } from '../utils/recentFiles';

interface UseFileOperationsParams {
  metadata: FileMetadata | null;
  setMetadata: React.Dispatch<React.SetStateAction<FileMetadata | null>>;
  setHasHeader: (hasHeader: boolean) => void;
  setActiveCell: (coord: CellCoordinate | null) => void;
  setActiveCellValue: (val: string) => void;
  setModifiedCells: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSearchState: React.Dispatch<React.SetStateAction<SearchState>>;
  setJumpToRowTrigger: (row: number | null) => void;
  setRawText: (text: string) => void;
  setRecentFiles: React.Dispatch<React.SetStateAction<RecentFile[]>>;
  setIsSaveModalOpen: (open: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  clearHistory: () => void;
  executeSearch: (
    query: string,
    caseSensitive: boolean,
    useRegex: boolean,
    colFilter: number | null
  ) => Promise<void>;
  searchState: SearchState;
}

export function useFileOperations({
  metadata,
  setMetadata,
  setHasHeader,
  setActiveCell,
  setActiveCellValue,
  setModifiedCells,
  setSearchState,
  setJumpToRowTrigger,
  setRawText,
  setRecentFiles,
  setIsSaveModalOpen,
  setViewMode,
  clearHistory,
  executeSearch,
  searchState,
}: UseFileOperationsParams) {
  // ファイルオープン (Fileオブジェクト)
  const handleOpenFile = useCallback(
    async (file: File) => {
      try {
        const meta = await TauriBridge.openFile(file);
        setMetadata(meta);
        setHasHeader(meta.hasHeader ?? true);
        setActiveCell({ row: 0, col: 0 });
        setModifiedCells(new Set());
        clearHistory();
        setSearchState((prev) => ({
          ...prev,
          query: '',
          matches: [],
          currentIndex: 0,
          regexError: null,
          filterMode: false,
        }));
        setJumpToRowTrigger(0);

        try {
          const text = await TauriBridge.getCurrentText(meta.lineEnding, meta.delimiter);
          setRawText(text || '');
        } catch (_) {}

        const updated = addRecentFile({
          name: file.name,
          path: (file as any).path || meta.filePath,
          size: file.size,
          encoding: meta.encoding,
        });
        setRecentFiles(updated);
      } catch (err) {
        console.error('Failed to open file:', err);
      }
    },
    [clearHistory, setActiveCell, setHasHeader, setJumpToRowTrigger, setMetadata, setModifiedCells, setRawText, setRecentFiles, setSearchState]
  );

  // ファイルパスからの直接オープン
  const handleOpenFilePath = useCallback(
    async (filePath: string) => {
      try {
        const meta = await TauriBridge.openFilePath(filePath);
        setMetadata(meta);
        setHasHeader(meta.hasHeader ?? true);
        setActiveCell({ row: 0, col: 0 });
        setModifiedCells(new Set());
        clearHistory();
        setSearchState((prev) => ({
          ...prev,
          query: '',
          matches: [],
          currentIndex: 0,
          regexError: null,
          filterMode: false,
        }));
        setJumpToRowTrigger(0);

        try {
          const text = await TauriBridge.getCurrentText(meta.lineEnding, meta.delimiter);
          setRawText(text || '');
        } catch (_) {}

        const updated = addRecentFile({
          name: meta.fileName,
          path: filePath,
          size: meta.fileSize,
          encoding: meta.encoding,
        });
        setRecentFiles(updated);
      } catch (err) {
        console.error('Failed to open file by path:', err);
      }
    },
    [clearHistory, setActiveCell, setHasHeader, setJumpToRowTrigger, setMetadata, setModifiedCells, setRawText, setRecentFiles, setSearchState]
  );

  // ファイルオープン（TauriネイティブダイアログまたはHTML5 input）
  const handleTriggerOpenFile = useCallback(async () => {
    if (isTauriEnv()) {
      const selectedPath = await TauriBridge.selectFileDialog();
      if (selectedPath) {
        await handleOpenFilePath(selectedPath);
        return;
      }
    }
    document.getElementById('btn-open-file')?.click();
  }, [handleOpenFilePath]);

  // 最近開いたファイルの再読込
  const handleOpenRecentFile = useCallback(
    async (recent: RecentFile) => {
      if (recent.path) {
        await handleOpenFilePath(recent.path);
      }
    },
    [handleOpenFilePath]
  );

  // 履歴クリア
  const handleClearRecentFiles = useCallback(() => {
    clearRecentFiles();
    setRecentFiles([]);
  }, [setRecentFiles]);

  // 表示モード切替 (表プレビュー ⇔ テキスト表示)
  const handleToggleViewMode = useCallback(
    async (mode: ViewMode) => {
      if (mode === 'text') {
        try {
          const text = await TauriBridge.getCurrentText(metadata?.lineEnding, metadata?.delimiter);
          setRawText(text || '');
        } catch (err) {
          console.error('Failed to get raw text:', err);
        }
      }
      setViewMode(mode);
    },
    [metadata?.delimiter, metadata?.lineEnding, setRawText, setViewMode]
  );

  // テキスト直接編集時の同期
  const handleRawTextChange = useCallback(
    async (newText: string) => {
      setRawText(newText);
      if (!metadata) return;
      try {
        const updatedMeta = await TauriBridge.updateFromText(newText, metadata.delimiter);
        setMetadata(updatedMeta);
      } catch (err) {
        console.error('Failed to update from text:', err);
      }
    },
    [metadata, setMetadata, setRawText]
  );

  // ヘッダ有無切替
  const handleToggleHasHeader = useCallback(
    async (val: boolean) => {
      try {
        const updated = await TauriBridge.setHasHeader(val);
        setHasHeader(val);
        setActiveCell({ row: 0, col: 0 });
        setMetadata((prev) =>
          prev
            ? {
                ...prev,
                totalRows: updated.totalRows,
                totalCols: updated.totalCols,
                headers: updated.headers,
                hasHeader: updated.hasHeader,
              }
            : null
        );

        setJumpToRowTrigger(0);

        try {
          const text = await TauriBridge.getCurrentText(metadata?.lineEnding, metadata?.delimiter);
          setRawText(text || '');
        } catch (_) {}

        if (searchState.query) {
          const { matches, error } = await TauriBridge.search(
            searchState.query,
            searchState.caseSensitive,
            searchState.useRegex,
            searchState.columnFilter
          );
          setSearchState((prev) => ({
            ...prev,
            matches,
            regexError: error,
            currentIndex: 0,
          }));
        }
      } catch (err) {
        console.error('Failed to toggle hasHeader:', err);
      }
    },
    [metadata?.delimiter, metadata?.lineEnding, searchState, setActiveCell, setHasHeader, setJumpToRowTrigger, setMetadata, setRawText, setSearchState]
  );

  // 保存ダイアログ
  const handleSaveFile = useCallback(() => {
    if (!metadata) return;
    setIsSaveModalOpen(true);
  }, [metadata, setIsSaveModalOpen]);

  // ファイル保存パス解決
  const resolveSavePath = (meta: FileMetadata, newFileName: string): string => {
    if (!meta.filePath) {
      return newFileName;
    }
    if (/^([a-zA-Z]:[\\/]|\\\\|\/)/.test(newFileName)) {
      return newFileName;
    }
    const lastSlashIndex = Math.max(
      meta.filePath.lastIndexOf('/'),
      meta.filePath.lastIndexOf('\\')
    );
    if (lastSlashIndex !== -1) {
      const parentDir = meta.filePath.substring(0, lastSlashIndex);
      const separator = meta.filePath.includes('\\') ? '\\' : '/';
      return `${parentDir}${separator}${newFileName}`;
    }
    return newFileName;
  };

  // 保存モーダル確定実行
  const handleSaveConfirm = useCallback(
    async (options: {
      fileName: string;
      encoding: SupportedEncoding;
      lineEnding: SupportedLineEnding;
      delimiter: SupportedDelimiter;
    }) => {
      if (!metadata) return;

      try {
        const targetFileName = options.fileName.trim() || metadata.fileName || 'export.csv';
        const targetSavePath = resolveSavePath(metadata, targetFileName);

        await TauriBridge.saveFile(
          targetSavePath,
          options.encoding,
          options.lineEnding,
          options.delimiter
        );

        await TauriBridge.clearModifiedCells();
        setModifiedCells(new Set());

        try {
          const text = await TauriBridge.getCurrentText(options.lineEnding, options.delimiter);
          setRawText(text || '');
        } catch (_) {}

        const updated = addRecentFile({
          name: targetFileName,
          path: targetSavePath,
          size: metadata.fileSize,
          encoding: options.encoding,
        });
        setRecentFiles(updated);

        setMetadata((prev) =>
          prev
            ? {
                ...prev,
                fileName: targetFileName,
                filePath: targetSavePath,
                encoding: options.encoding,
                lineEnding: options.lineEnding,
                delimiter: options.delimiter,
                isDirty: false,
              }
            : null
        );
      } catch (err) {
        console.error('Failed to save file:', err);
        alert(`ファイルの保存に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [metadata, setMetadata, setModifiedCells, setRawText, setRecentFiles]
  );

  // 区切り文字変更
  const handleDelimiterChange = useCallback(
    async (delimiter: SupportedDelimiter) => {
      if (!metadata) return;
      try {
        const updatedMeta = await TauriBridge.reloadWithEncoding(metadata.encoding, delimiter);
        setMetadata(updatedMeta);
        setActiveCellValue('');
        setModifiedCells(new Set());

        try {
          const text = await TauriBridge.getCurrentText(updatedMeta.lineEnding, updatedMeta.delimiter);
          setRawText(text || '');
        } catch (_) {}

        if (searchState.query) {
          executeSearch(
            searchState.query,
            searchState.caseSensitive,
            searchState.useRegex,
            searchState.columnFilter
          );
        }
      } catch (err) {
        console.error('Failed to change delimiter:', err);
      }
    },
    [executeSearch, metadata, searchState, setActiveCellValue, setMetadata, setModifiedCells, setRawText]
  );

  // エンコーディング変更
  const handleEncodingChange = useCallback(
    async (encoding: SupportedEncoding) => {
      if (!metadata) return;
      try {
        const updatedMeta = await TauriBridge.reloadWithEncoding(encoding, metadata.delimiter);
        setMetadata(updatedMeta);
        setActiveCellValue('');
        setModifiedCells(new Set());

        try {
          const text = await TauriBridge.getCurrentText(updatedMeta.lineEnding, updatedMeta.delimiter);
          setRawText(text || '');
        } catch (_) {}

        if (searchState.query) {
          executeSearch(
            searchState.query,
            searchState.caseSensitive,
            searchState.useRegex,
            searchState.columnFilter
          );
        }
      } catch (err) {
        console.error('Failed to reload with encoding:', err);
        setMetadata((prev) => (prev ? { ...prev, encoding, isDirty: true } : null));
      }
    },
    [executeSearch, metadata, searchState, setActiveCellValue, setMetadata, setModifiedCells, setRawText]
  );

  // 改行コード変更
  const handleLineEndingChange = useCallback(
    (lineEnding: SupportedLineEnding) => {
      if (!metadata) return;
      setMetadata((prev) => (prev ? { ...prev, lineEnding, isDirty: true } : null));
    },
    [metadata, setMetadata]
  );

  return {
    handleOpenFile,
    handleOpenFilePath,
    handleTriggerOpenFile,
    handleOpenRecentFile,
    handleClearRecentFiles,
    handleToggleViewMode,
    handleRawTextChange,
    handleToggleHasHeader,
    handleSaveFile,
    handleSaveConfirm,
    handleDelimiterChange,
    handleEncodingChange,
    handleLineEndingChange,
  };
}
