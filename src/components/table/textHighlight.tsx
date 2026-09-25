import React from 'react';

/**
 * キーワード検索・正規表現検索に対応したテキストハイライトレンダラー
 * ライトモード／ダークモード両方で視認性の高いマークアップを生成
 */
export function renderHighlightedText(
  text: string,
  query?: string,
  caseSensitive: boolean = false,
  useRegex: boolean = false
): React.ReactNode {
  if (!query || query.trim() === '' || !text) {
    return text;
  }

  if (useRegex) {
    try {
      const regex = new RegExp(`(${query})`, caseSensitive ? 'g' : 'gi');
      const parts = text.split(regex);
      if (parts.length <= 1) return text;

      const testRegex = new RegExp(`^${query}$`, caseSensitive ? '' : 'i');
      return parts.map((part, idx) => {
        if (part && testRegex.test(part)) {
          return (
            <mark
              key={idx}
              className="bg-yellow-300 dark:bg-amber-400 text-gray-950 px-0.5 rounded-xs shadow-xs select-none font-semibold"
            >
              {part}
            </mark>
          );
        }
        return part;
      });
    } catch {
      return text;
    }
  }

  const querySearch = caseSensitive ? query : query.toLowerCase();
  const textSearch = caseSensitive ? text : text.toLowerCase();

  if (!textSearch.includes(querySearch)) {
    return text;
  }

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  const qLen = query.length;

  while (lastIndex < text.length) {
    const matchIndex = textSearch.indexOf(querySearch, lastIndex);
    if (matchIndex === -1) {
      nodes.push(text.slice(lastIndex));
      break;
    }

    if (matchIndex > lastIndex) {
      nodes.push(text.slice(lastIndex, matchIndex));
    }

    nodes.push(
      <mark
        key={matchIndex}
        className="bg-yellow-300 dark:bg-amber-400 text-gray-950 px-0.5 rounded-xs shadow-xs select-none font-semibold"
      >
        {text.slice(matchIndex, matchIndex + qLen)}
      </mark>
    );

    lastIndex = matchIndex + qLen;
  }

  return nodes;
}
