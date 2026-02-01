/**
 * WordCloud - Tag cloud renderer
 *
 * Displays words at varying font sizes based on vote count.
 * Each word is a clickable button for voting.
 */

import { getWordFontSize, getWordColor, type WordEntry } from '../lib/wordwall';

interface WordCloudProps {
  words: WordEntry[];
  votedWords: Set<string>;
  onVote: (slug: string) => void;
}

export function WordCloud({ words, votedWords, onVote }: WordCloudProps) {
  const maxVotes = words.length > 0 ? Math.max(...words.map((w) => w.votes)) : 1;

  if (words.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 dark:text-gray-500">
        <p className="text-lg">No words yet. Be the first to add one.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 px-4 py-8">
      {words.map((word) => {
        const fontSize = getWordFontSize(word.votes, maxVotes);
        const color = getWordColor(word.slug);
        const hasVoted = votedWords.has(word.slug);

        return (
          <button
            key={word.slug}
            onClick={() => !hasVoted && onVote(word.slug)}
            className={`
              inline-flex items-center gap-1 px-3 py-1.5 rounded-full
              transition-all duration-300 ease-out
              min-h-[44px] min-w-[44px]
              ${hasVoted
                ? 'opacity-70 cursor-default ring-2 ring-offset-1 ring-gray-300 dark:ring-gray-600'
                : 'hover:scale-110 hover:shadow-md cursor-pointer active:scale-95'
              }
            `}
            style={{
              fontSize: `${fontSize}px`,
              color,
              backgroundColor: `${color}10`,
            }}
            title={`${word.votes} vote${word.votes !== 1 ? 's' : ''}${hasVoted ? ' (voted)' : ' — click to vote'}`}
          >
            <span className="font-semibold whitespace-nowrap">{word.text}</span>
            {hasVoted && (
              <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
