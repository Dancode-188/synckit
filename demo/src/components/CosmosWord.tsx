/**
 * Cosmos Word - Individual word in the Word Cosmos
 *
 * Features:
 * - Parallax movement based on depth layer
 * - Glow intensity based on vote count
 * - Shooting star animation when new
 * - Hover effects
 */

import { type WordEntry } from '../lib/wordwall';

interface CosmosWordProps {
  word: WordEntry;
  position: { x: number; y: number };
  depth: number; // 0 = closest, 2 = furthest
  mousePos: { x: number; y: number };
  maxVotes: number;
  hasVoted: boolean;
  onVote: () => void;
  isNew: boolean;
}

// Color palette for words (cosmic theme)
const COSMOS_COLORS = [
  '#a78bfa', // violet-400
  '#818cf8', // indigo-400
  '#60a5fa', // blue-400
  '#22d3ee', // cyan-400
  '#34d399', // emerald-400
  '#fbbf24', // amber-400
  '#f472b6', // pink-400
  '#fb7185', // rose-400
  '#c084fc', // purple-400
  '#38bdf8', // sky-400
];

function getWordColor(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COSMOS_COLORS[Math.abs(hash) % COSMOS_COLORS.length];
}

export function CosmosWord({
  word,
  position,
  depth,
  mousePos,
  maxVotes,
  hasVoted,
  onVote,
  isNew,
}: CosmosWordProps) {
  // Parallax offset based on depth and mouse position
  // Closer objects (depth 0) move more, distant (depth 2) move less
  const parallaxStrength = [25, 12, 5][depth];
  const offsetX = (mousePos.x - 0.5) * parallaxStrength;
  const offsetY = (mousePos.y - 0.5) * parallaxStrength;

  // Size based on votes (14-36px range)
  const voteRatio = Math.min(word.votes / maxVotes, 1);
  const fontSize = 14 + voteRatio * 22;

  // Glow intensity based on votes
  const glowIntensity = Math.min(word.votes / Math.max(maxVotes * 0.5, 3), 1);

  // Opacity based on depth (closer = more visible)
  const opacity = [1, 0.85, 0.7][depth];

  // Z-index based on depth
  const zIndex = [30, 20, 10][depth];

  const color = getWordColor(word.slug);

  return (
    <button
      onClick={onVote}
      className={`
        cosmos-word
        ${isNew ? 'cosmos-word-new' : ''}
        ${hasVoted ? 'cosmos-word-voted' : ''}
      `}
      style={{
        left: `${position.x * 100}%`,
        top: `${position.y * 100}%`,
        transform: `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`,
        fontSize: `${fontSize}px`,
        color,
        opacity,
        zIndex,
        textShadow: glowIntensity > 0
          ? `0 0 ${8 + glowIntensity * 15}px ${color}${Math.round(glowIntensity * 80).toString(16).padStart(2, '0')}`
          : 'none',
      }}
      title={`${word.votes} vote${word.votes !== 1 ? 's' : ''}${hasVoted ? ' (voted)' : ' — click to vote'}`}
    >
      <span className="cosmos-word-text">{word.text}</span>
      {hasVoted && (
        <svg className="cosmos-word-check" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )}
    </button>
  );
}
