/**
 * Search Dialog
 * Global search across all pages and blocks
 */

import { useState, useEffect, useRef } from 'react';
import { SyncKit } from '@synckit-js/sdk';
import { PageDocument, parseBlockOrder } from '../lib/blocks';

interface SearchResult {
  pageId: string;
  pageTitle: string;
  pageIcon: string;
  blockId: string;
  blockContent: string;
  matchIndex: number;
}

interface SearchDialogProps {
  synckit: SyncKit | null;
  pages: Array<{ id: string; title: string; icon: string }>;
  onNavigate: (pageId: string) => void;
  onClose: () => void;
}

export function SearchDialog({ synckit, pages, onNavigate, onClose }: SearchDialogProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Perform search
  useEffect(() => {
    if (!synckit || !query.trim()) {
      setResults([]);
      return;
    }

    const searchTerm = query.toLowerCase().trim();
    setIsSearching(true);

    const performSearch = async () => {
      const foundResults: SearchResult[] = [];

      for (const page of pages) {
        try {
          const doc = synckit.document<PageDocument>(page.id);
          const data = await doc.get();

          // Search in page title
          if (page.title.toLowerCase().includes(searchTerm)) {
            foundResults.push({
              pageId: page.id,
              pageTitle: page.title,
              pageIcon: page.icon,
              blockId: '',
              blockContent: `Page: ${page.title}`,
              matchIndex: page.title.toLowerCase().indexOf(searchTerm),
            });
          }

          // Get block order
          const blockOrder = parseBlockOrder((data.blockOrder as string) || '[]');

          // Search in blocks
          for (const blockId of blockOrder) {
            const block = data[`block:${blockId}`] as any;
            if (!block) continue;

            const content = block.content || '';
            const lowerContent = content.toLowerCase();

            if (lowerContent.includes(searchTerm)) {
              // Find the match position
              const matchIndex = lowerContent.indexOf(searchTerm);

              // Extract context around the match (50 chars before and after)
              const contextStart = Math.max(0, matchIndex - 50);
              const contextEnd = Math.min(content.length, matchIndex + searchTerm.length + 50);
              let contextContent = content.slice(contextStart, contextEnd);

              // Add ellipsis if we're not at the start/end
              if (contextStart > 0) contextContent = '...' + contextContent;
              if (contextEnd < content.length) contextContent = contextContent + '...';

              foundResults.push({
                pageId: page.id,
                pageTitle: page.title,
                pageIcon: page.icon,
                blockId,
                blockContent: contextContent,
                matchIndex,
              });
            }
          }
        } catch (error) {
          console.error(`Failed to search page ${page.id}:`, error);
        }
      }

      setResults(foundResults);
      setIsSearching(false);
    };

    performSearch();
  }, [query, synckit, pages]);

  const handleResultClick = (result: SearchResult) => {
    onNavigate(result.pageId);
    onClose();
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;

    const parts = [];
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase().trim();
    let lastIndex = 0;
    let index = lowerText.indexOf(lowerQuery);

    while (index !== -1) {
      // Add text before match
      if (index > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`}>{text.slice(lastIndex, index)}</span>
        );
      }

      // Add highlighted match
      parts.push(
        <mark
          key={`mark-${index}`}
          className="bg-yellow-200 dark:bg-yellow-900/50 text-gray-900 dark:text-gray-100 font-medium"
        >
          {text.slice(index, index + lowerQuery.length)}
        </mark>
      );

      lastIndex = index + lowerQuery.length;
      index = lowerText.indexOf(lowerQuery, lastIndex);
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex)}</span>);
    }

    return <>{parts}</>;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-30 dark:bg-opacity-50 z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 animate-scale-in max-h-[70vh] flex flex-col">
          {/* Search input */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pages and blocks..."
                className="flex-1 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none text-base"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto">
            {!query.trim() ? (
              <div className="p-8 text-center">
                <svg className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  Type to search across all pages and blocks
                </p>
                <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
                  Press Esc to close
                </p>
              </div>
            ) : isSearching ? (
              <div className="p-8 text-center">
                <div className="w-8 h-8 border-3 border-gray-300 dark:border-gray-600 border-t-primary-500 dark:border-t-primary-400 rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Searching...</p>
              </div>
            ) : results.length === 0 ? (
              <div className="p-8 text-center">
                <svg className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  No results found for "{query}"
                </p>
              </div>
            ) : (
              <div className="p-2">
                {results.map((result, index) => (
                  <button
                    key={`${result.pageId}-${result.blockId}-${index}`}
                    onClick={() => handleResultClick(result)}
                    className="w-full text-left p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 hover:scale-[1.01] active:scale-[0.99] transition-all duration-150 mb-1"
                  >
                    <div className="flex items-start gap-3">
                      {/* Page icon */}
                      <span className="text-2xl flex-shrink-0">{result.pageIcon}</span>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Page title */}
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                          {highlightMatch(result.pageTitle, query)}
                        </div>

                        {/* Block content */}
                        {result.blockContent && !result.blockContent.startsWith('Page:') && (
                          <div className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                            {highlightMatch(result.blockContent, query)}
                          </div>
                        )}
                      </div>

                      {/* Arrow icon */}
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-4">
                <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
                <span>•</span>
                <span>{pages.length} page{pages.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs font-mono">ESC</kbd>
                <span>to close</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
