/**
 * Reaction Picker Component
 * Emoji selection popover for text reactions
 */

import { useState } from 'react';

const REACTIONS = ['👍', '🎉', '🤔', '❤️', '🔥', '👏'];

interface ReactionPickerProps {
  position: { x: number; y: number };
  onReact: (emoji: string) => void;
  onClose: () => void;
}

export function ReactionPicker({ position, onReact, onClose }: ReactionPickerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleReact = (emoji: string) => {
    onReact(emoji);
    onClose();
  };

  return (
    <div
      className="fixed z-[90] animate-scale-in"
      style={{
        left: `${position.x}px`,
        top: `${position.y - 50}px`,
        transform: 'translateX(-50%)',
      }}
    >
      {isExpanded ? (
        <div className="flex items-center gap-1 px-2 py-1 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleReact(emoji)}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-xl hover:scale-125 transform"
            >
              {emoji}
            </button>
          ))}
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-400"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsExpanded(true)}
          className="flex items-center justify-center w-8 h-8 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <span className="text-sm">😀</span>
        </button>
      )}
    </div>
  );
}
