/**
 * Word Cosmos - Immersive space-themed word visualization
 *
 * Features:
 * - 3D parallax effect on mouse movement
 * - Words positioned deterministically by hash
 * - Vote-based glow intensity
 * - Shooting star animation for new words
 * - Nebula/starfield background
 */

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { CosmosWord } from './CosmosWord';
import { type WordEntry } from '../lib/wordwall';

interface WordCosmosProps {
  words: WordEntry[];
  votedWords: Set<string>;
  onVote: (slug: string) => void;
}

// Generate deterministic position from slug hash
function hashToPosition(slug: string): { x: number; y: number } {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = ((hash << 5) - hash) + slug.charCodeAt(i);
    hash |= 0;
  }
  // Position in range [0.08, 0.92] to avoid edges
  const x = 0.08 + (Math.abs(hash % 1000) / 1000) * 0.84;
  const y = 0.08 + (Math.abs((hash >> 10) % 1000) / 1000) * 0.84;
  return { x, y };
}

// Generate random stars for background
function generateStars(count: number): { x: number; y: number; size: number; opacity: number }[] {
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 1.5 + 0.5,
      opacity: Math.random() * 0.5 + 0.3,
    });
  }
  return stars;
}

export function WordCosmos({ words, votedWords, onVote }: WordCosmosProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const [newWordSlug, setNewWordSlug] = useState<string | null>(null);
  const prevWordsRef = useRef<Set<string>>(new Set());

  // Static stars (memoized once)
  const stars = useMemo(() => generateStars(80), []);

  // Track new words for shooting star animation
  useEffect(() => {
    const currentSlugs = new Set(words.map(w => w.slug));
    const prevSlugs = prevWordsRef.current;

    // Find newly added words
    for (const slug of currentSlugs) {
      if (!prevSlugs.has(slug)) {
        setNewWordSlug(slug);
        // Clear after animation
        setTimeout(() => setNewWordSlug(null), 1500);
        break;
      }
    }

    prevWordsRef.current = currentSlugs;
  }, [words]);

  // Handle mouse movement for parallax
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePos({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  }, []);

  // Reset parallax when mouse leaves
  const handleMouseLeave = useCallback(() => {
    setMousePos({ x: 0.5, y: 0.5 });
  }, []);

  // Calculate depth layers based on votes
  const wordsWithDepth = useMemo(() => {
    const maxVotes = Math.max(...words.map(w => w.votes), 1);
    return words.map(word => ({
      ...word,
      // Higher votes = closer (depth 0), lower votes = further (depth 2)
      depth: word.votes > maxVotes * 0.6 ? 0 : word.votes > maxVotes * 0.3 ? 1 : 2,
      position: hashToPosition(word.slug),
    }));
  }, [words]);

  if (words.length === 0) {
    return (
      <div className="cosmos-container flex items-center justify-center">
        <div className="cosmos-nebula" />
        <div className="cosmos-stars-layer">
          {stars.map((star, i) => (
            <div
              key={i}
              className="cosmos-star"
              style={{
                left: `${star.x}%`,
                top: `${star.y}%`,
                width: `${star.size}px`,
                height: `${star.size}px`,
                opacity: star.opacity,
              }}
            />
          ))}
        </div>
        <p className="text-indigo-200/60 text-lg z-10 relative">
          No words yet. Be the first to add one.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="cosmos-container"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Nebula gradient background */}
      <div className="cosmos-nebula" />

      {/* Static star field */}
      <div className="cosmos-stars-layer">
        {stars.map((star, i) => (
          <div
            key={i}
            className="cosmos-star"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              opacity: star.opacity,
            }}
          />
        ))}
      </div>

      {/* Words at different depth layers */}
      {wordsWithDepth.map(word => (
        <CosmosWord
          key={word.slug}
          word={word}
          position={word.position}
          depth={word.depth}
          mousePos={mousePos}
          maxVotes={Math.max(...words.map(w => w.votes), 1)}
          hasVoted={votedWords.has(word.slug)}
          onVote={() => !votedWords.has(word.slug) && onVote(word.slug)}
          isNew={word.slug === newWordSlug}
        />
      ))}
    </div>
  );
}
