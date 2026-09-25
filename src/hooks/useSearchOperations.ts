import React, { useCallback, useMemo } from 'react';
import { CellCoordinate, FileMetadata, HistoryAction, SearchMatch, SearchState } from '../types/csv';
import { TauriBridge } from '../services/tauriBridge';

interface UseSearchOperationsParams {
  searchState: SearchState;
  setSearchState: React.Dispatch<React.SetStateAction<SearchState>>;
  activeCell: CellCoordinate | null;
  setActiveCell: (coord: CellCoordinate | null) => void;
  setActiveCellValue: (val: string) => void;
  setJumpToRowTrigger: (row: number | null) => void;
  setModifiedCells: React.Dispatch<React.SetStateAction<Set<string>>>;
  setMetadata: React.Dispatch<React.SetStateAction<FileMetadata | null>>;
  pushAction: (action: HistoryAction) => void;
}

export function useSearchOperations({
  searchState,
  setSearchState,
  activeCell,
  setActiveCell,
  setActiveCellValue,
  setJumpToRowTrigger,
  setModifiedCells,
  setMetadata,
  pushAction,
}: UseSearchOperationsParams) {
  // 検索一致行のユニークな物理行インデックス一覧（昇順）
  const matchedRowIndices = useMemo(() => {
    if (!searchState.matches || searchState.matches.length === 0) return [];
    const rowSet = new Set<number>();
    for (const m of searchState.matches) {
      rowSet.add(m.row);
    }
    return Array.from(rowSet).sort((a, b) => a - b);
  }, [searchState.matches]);

  // 検索クエリ実行
  const executeSearch = useCallback(
    async (
      query: string,
      caseSensitive: boolean,
      useRegex: boolean,
      colFilter: number | null
    ) => {
      if (!query.trim()) {
        setSearchState((prev) => ({
          ...prev,
          query,
          matches: [],
          currentIndex: 0,
          regexError: null,
          filterMode: false,
        }));
        return;
      }
      try {
        const { matches, error } = await TauriBridge.search(
          query,
          caseSensitive,
          useRegex,
          colFilter
        );
        setSearchState((prev) => ({
          ...prev,
          query,
          caseSensitive,
          useRegex,
          regexError: error,
          columnFilter: colFilter,
          matches,
          currentIndex: 0,
        }));
        if (matches.length > 0) {
          const first = matches[0];
          setActiveCell({ row: first.row, col: first.col });
          setActiveCellValue(first.value);
          setJumpToRowTrigger(first.row);
        }
      } catch (err) {
        console.error('Search failed:', err);
      }
    },
    [setActiveCell, setActiveCellValue, setJumpToRowTrigger, setSearchState]
  );

  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchState((prev) => ({ ...prev, query }));
      executeSearch(query, searchState.caseSensitive, searchState.useRegex, searchState.columnFilter);
    },
    [executeSearch, searchState.caseSensitive, searchState.columnFilter, searchState.useRegex, setSearchState]
  );

  const handleToggleCaseSensitive = useCallback(() => {
    const nextVal = !searchState.caseSensitive;
    setSearchState((prev) => ({ ...prev, caseSensitive: nextVal }));
    executeSearch(searchState.query, nextVal, searchState.useRegex, searchState.columnFilter);
  }, [executeSearch, searchState.caseSensitive, searchState.columnFilter, searchState.query, searchState.useRegex, setSearchState]);

  const handleToggleRegex = useCallback(() => {
    const nextVal = !searchState.useRegex;
    setSearchState((prev) => ({ ...prev, useRegex: nextVal }));
    executeSearch(searchState.query, searchState.caseSensitive, nextVal, searchState.columnFilter);
  }, [executeSearch, searchState.caseSensitive, searchState.columnFilter, searchState.query, searchState.useRegex, setSearchState]);

  const handleToggleFilterMode = useCallback(() => {
    setSearchState((prev) => ({ ...prev, filterMode: !prev.filterMode }));
  }, [setSearchState]);

  const handleColumnFilterChange = useCallback(
    (colIndex: number | null) => {
      setSearchState((prev) => ({ ...prev, columnFilter: colIndex }));
      executeSearch(searchState.query, searchState.caseSensitive, searchState.useRegex, colIndex);
    },
    [executeSearch, searchState.caseSensitive, searchState.query, searchState.useRegex, setSearchState]
  );

  const handleNextMatch = useCallback(() => {
    if (searchState.matches.length === 0) return;
    const nextIdx = (searchState.currentIndex + 1) % searchState.matches.length;
    setSearchState((prev) => ({ ...prev, currentIndex: nextIdx }));
    const match = searchState.matches[nextIdx];
    setActiveCell({ row: match.row, col: match.col });
    setActiveCellValue(match.value);
    setJumpToRowTrigger(match.row);
  }, [searchState.currentIndex, searchState.matches, setActiveCell, setActiveCellValue, setJumpToRowTrigger, setSearchState]);

  const handlePrevMatch = useCallback(() => {
    if (searchState.matches.length === 0) return;
    const prevIdx =
      (searchState.currentIndex - 1 + searchState.matches.length) % searchState.matches.length;
    setSearchState((prev) => ({ ...prev, currentIndex: prevIdx }));
    const match = searchState.matches[prevIdx];
    setActiveCell({ row: match.row, col: match.col });
    setActiveCellValue(match.value);
    setJumpToRowTrigger(match.row);
  }, [searchState.currentIndex, searchState.matches, setActiveCell, setActiveCellValue, setJumpToRowTrigger, setSearchState]);

  // モーダル内での検索ハンドラ
  const handleFindNextInModal = useCallback(
    async (
      q: string,
      caseSens: boolean,
      regex: boolean,
      colFilt: number | null
    ): Promise<SearchMatch | null> => {
      try {
        const { matches, error } = await TauriBridge.search(q, caseSens, regex, colFilt);
        setSearchState((prev) => ({
          ...prev,
          query: q,
          caseSensitive: caseSens,
          useRegex: regex,
          regexError: error,
          columnFilter: colFilt,
          matches,
        }));

        if (matches.length > 0) {
          let nextIdx = 0;
          if (activeCell) {
            const found = matches.findIndex(
              (m) => m.row > activeCell.row || (m.row === activeCell.row && m.col > activeCell.col)
            );
            nextIdx = found !== -1 ? found : 0;
          }
          const match = matches[nextIdx];
          setSearchState((prev) => ({ ...prev, currentIndex: nextIdx }));
          setActiveCell({ row: match.row, col: match.col });
          setActiveCellValue(match.value);
          setJumpToRowTrigger(match.row);
          return match;
        }
        return null;
      } catch (err) {
        console.error('Find next failed:', err);
        return null;
      }
    },
    [activeCell, setActiveCell, setActiveCellValue, setJumpToRowTrigger, setSearchState]
  );

  const handleFindPrevInModal = useCallback(
    async (
      q: string,
      caseSens: boolean,
      regex: boolean,
      colFilt: number | null
    ): Promise<SearchMatch | null> => {
      try {
        const { matches, error } = await TauriBridge.search(q, caseSens, regex, colFilt);
        setSearchState((prev) => ({
          ...prev,
          query: q,
          caseSensitive: caseSens,
          useRegex: regex,
          regexError: error,
          columnFilter: colFilt,
          matches,
        }));

        if (matches.length > 0) {
          let prevIdx = matches.length - 1;
          if (activeCell) {
            const foundReverse = [...matches]
              .reverse()
              .findIndex((m) => m.row < activeCell.row || (m.row === activeCell.row && m.col < activeCell.col));
            if (foundReverse !== -1) {
              prevIdx = matches.length - 1 - foundReverse;
            }
          }
          const match = matches[prevIdx];
          setSearchState((prev) => ({ ...prev, currentIndex: prevIdx }));
          setActiveCell({ row: match.row, col: match.col });
          setActiveCellValue(match.value);
          setJumpToRowTrigger(match.row);
          return match;
        }
        return null;
      } catch (err) {
        console.error('Find prev failed:', err);
        return null;
      }
    },
    [activeCell, setActiveCell, setActiveCellValue, setJumpToRowTrigger, setSearchState]
  );

  const handleReplaceCurrentInModal = useCallback(
    async (
      q: string,
      rep: string,
      caseSens: boolean,
      regex: boolean,
      colFilt: number | null
    ): Promise<boolean> => {
      if (!activeCell) return false;
      try {
        const res = await TauriBridge.replaceCell(
          activeCell.row,
          activeCell.col,
          q,
          rep,
          caseSens,
          regex
        );
        if (res) {
          setModifiedCells((prev) => new Set(prev).add(`${res.row},${res.col}`));
          setMetadata((prev) => (prev ? { ...prev, isDirty: true } : null));
          pushAction({
            type: 'EDIT_CELL',
            row: res.row,
            col: res.col,
            prevValue: res.prevValue,
            newValue: res.newValue,
          });
          setActiveCellValue(res.newValue);
          await handleFindNextInModal(q, caseSens, regex, colFilt);
          return true;
        }
        return false;
      } catch (err) {
        console.error('Replace current failed:', err);
        return false;
      }
    },
    [activeCell, handleFindNextInModal, pushAction, setActiveCellValue, setMetadata, setModifiedCells]
  );

  const handleReplaceAllInModal = useCallback(
    async (
      q: string,
      rep: string,
      caseSens: boolean,
      regex: boolean,
      colFilt: number | null
    ): Promise<number> => {
      try {
        const res = await TauriBridge.replaceAll(q, rep, caseSens, regex, colFilt);
        if (res && res.replacedCount > 0) {
          setModifiedCells((prev) => {
            const next = new Set(prev);
            res.changes.forEach((c) => next.add(`${c.row},${c.col}`));
            return next;
          });
          setMetadata((prev) => (prev ? { ...prev, isDirty: true } : null));
          pushAction({
            type: 'BATCH_REPLACE',
            description: `${res.replacedCount} 件の置換`,
            changes: res.changes,
          });

          await executeSearch(q, caseSens, regex, colFilt);
          return res.replacedCount;
        }
        return 0;
      } catch (err) {
        console.error('Replace all failed:', err);
        throw err;
      }
    },
    [executeSearch, pushAction, setMetadata, setModifiedCells]
  );

  return {
    matchedRowIndices,
    executeSearch,
    handleSearchChange,
    handleToggleCaseSensitive,
    handleToggleRegex,
    handleToggleFilterMode,
    handleColumnFilterChange,
    handleNextMatch,
    handlePrevMatch,
    handleFindNextInModal,
    handleFindPrevInModal,
    handleReplaceCurrentInModal,
    handleReplaceAllInModal,
  };
}
