/**
 * WordPulse - Developer-focused word cloud with real-time presence
 *
 * Features:
 * - Stable, readable word layout (settles into position)
 * - Figma-style multiplayer cursors
 * - Vote ripples visible to all users
 * - Presence indicator ("5 people here")
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { useSyncKit } from '../contexts/SyncKitContext';
import { useWordLayout } from '../hooks/useWordLayout';
import { useWordWallPresence } from '../hooks/useWordWallPresence';
import type { WordEntry } from '../lib/wordwall';

// ============================================================================
// Types
// ============================================================================

interface WordPulseProps {
  words: WordEntry[];
  votedWords: Set<string>;
  onVote: (slug: string) => void;
}

interface Ripple {
  id: string;
  x: number;
  y: number;
  startTime: number;
}

// ============================================================================
// Component
// ============================================================================

export function WordPulse({ words, votedWords, onVote }: WordPulseProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Get SyncKit from context
  const { synckit } = useSyncKit();

  // Layout engine
  const { nodes } = useWordLayout({
    words,
    width: dimensions.width,
    height: dimensions.height,
  });

  // Presence system
  const { remoteUsers, viewerCount, updateCursor, updateHoveredWord } =
    useWordWallPresence({
      synckit,
      documentId: 'wordwall',
    });

  // Track previous vote counts for ripple detection
  const prevVotesRef = useRef<Map<string, number>>(new Map());

  // Detect votes from others and create ripples
  useEffect(() => {
    const prevVotes = prevVotesRef.current;

    for (const word of words) {
      const prev = prevVotes.get(word.slug);
      if (prev !== undefined && word.votes > prev) {
        // Vote happened - find the node and create ripple
        const node = nodes.find((n) => n.id === word.slug);
        if (node) {
          setRipples((r) => [
            ...r,
            {
              id: `${word.slug}-${Date.now()}`,
              x: node.x,
              y: node.y,
              startTime: Date.now(),
            },
          ]);
        }
      }
    }

    // Update previous votes
    prevVotesRef.current = new Map(words.map((w) => [w.slug, w.votes]));
  }, [words, nodes]);

  // Clean up old ripples
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setRipples((r) => r.filter((ripple) => now - ripple.startTime < 1000));
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({
        width: Math.floor(width),
        height: Math.max(350, Math.floor(height)),
      });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensions;

    // Clear with background
    ctx.fillStyle = '#0f172a'; // Slate 900
    ctx.fillRect(0, 0, width, height);

    // Draw words
    for (const node of nodes) {
      const hasVoted = votedWords.has(node.id);
      const isHoveredByOther = remoteUsers.some((u) => u.hoveredWord === node.id);
      const isHoveredByMe = hoveredNode === node.id;

      // Skip if still in entry animation but not visible yet
      if (node.isNew && node.entryProgress < 0.1) continue;

      // Entry animation scale
      const scale = node.isNew ? node.entryProgress : 1;

      ctx.save();

      if (scale < 1) {
        ctx.translate(node.x, node.y);
        ctx.scale(scale, scale);
        ctx.translate(-node.x, -node.y);
      }

      // Font
      ctx.font = `600 ${node.fontSize}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Glow for high votes (visible at 3+ votes)
      if (node.votes >= 3) {
        ctx.shadowColor = 'rgba(99, 102, 241, 0.8)';
        ctx.shadowBlur = Math.min(node.votes * 3, 30);
      }

      // Color based on state
      if (hasVoted) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.5)'; // Muted slate
      } else if (isHoveredByMe) {
        ctx.fillStyle = '#818cf8'; // Indigo 400
      } else if (isHoveredByOther) {
        ctx.fillStyle = '#a5b4fc'; // Indigo 300
      } else {
        ctx.fillStyle = '#e2e8f0'; // Slate 200
      }

      ctx.fillText(node.text, node.x, node.y);
      ctx.shadowBlur = 0;

      ctx.restore();
    }

    // Draw vote ripples
    const now = Date.now();
    for (const ripple of ripples) {
      const age = now - ripple.startTime;
      if (age > 1000) continue;

      const progress = age / 1000;
      const radius = progress * 60;
      const alpha = (1 - progress) * 0.5;

      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(251, 191, 36, ${alpha})`; // Amber
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw remote cursors
    for (const user of remoteUsers) {
      if (!user.cursor) continue;

      const { x, y } = user.cursor;

      // Cursor triangle
      ctx.fillStyle = user.color;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 10, y + 14);
      ctx.lineTo(x + 3.5, y + 10.5);
      ctx.closePath();
      ctx.fill();

      // White outline for visibility
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Name label
      const firstName = user.name.split(' ')[0];
      ctx.font = '11px Inter, system-ui, sans-serif';
      const labelWidth = ctx.measureText(firstName).width + 8;

      // Label background
      ctx.fillStyle = user.color;
      ctx.beginPath();
      ctx.roundRect(x + 12, y + 14, labelWidth, 16, 3);
      ctx.fill();

      // Label text
      ctx.fillStyle = 'white';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(firstName, x + 16, y + 22);
    }
  }, [nodes, ripples, remoteUsers, votedWords, hoveredNode, dimensions]);

  // Hit test helper
  const getNodeAtPosition = useCallback(
    (x: number, y: number) => {
      // Check nodes in reverse order (top-most first)
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        if (node.isNew && node.entryProgress < 0.5) continue;

        const dx = Math.abs(node.x - x);
        const dy = Math.abs(node.y - y);

        if (dx < node.width / 2 && dy < node.height / 2) {
          return node;
        }
      }
      return null;
    },
    [nodes]
  );

  // Mouse move handler
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Update remote cursor position
      updateCursor({ x, y });

      // Check hover
      const node = getNodeAtPosition(x, y);
      const newHovered = node?.id || null;

      if (newHovered !== hoveredNode) {
        setHoveredNode(newHovered);
        updateHoveredWord(newHovered);
      }
    },
    [updateCursor, updateHoveredWord, getNodeAtPosition, hoveredNode]
  );

  // Mouse leave handler
  const handleMouseLeave = useCallback(() => {
    updateCursor(null);
    setHoveredNode(null);
    updateHoveredWord(null);
  }, [updateCursor, updateHoveredWord]);

  // Click to vote
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const node = getNodeAtPosition(x, y);

      if (node && !votedWords.has(node.id)) {
        onVote(node.id);

        // Add local ripple immediately for feedback
        setRipples((r) => [
          ...r,
          {
            id: `${node.id}-local-${Date.now()}`,
            x: node.x,
            y: node.y,
            startTime: Date.now(),
          },
        ]);
      }
    },
    [getNodeAtPosition, votedWords, onVote]
  );

  // Touch handlers for mobile
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      const node = getNodeAtPosition(x, y);

      if (node && !votedWords.has(node.id)) {
        onVote(node.id);

        setRipples((r) => [
          ...r,
          {
            id: `${node.id}-touch-${Date.now()}`,
            x: node.x,
            y: node.y,
            startTime: Date.now(),
          },
        ]);
      }
    },
    [getNodeAtPosition, votedWords, onVote]
  );

  // Cursor style based on hover state
  const cursorStyle = hoveredNode && !votedWords.has(hoveredNode) ? 'pointer' : 'default';

  return (
    <div ref={containerRef} className="pulse-container">
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        className="pulse-canvas"
        style={{ cursor: cursorStyle }}
      />

      {/* Presence indicator */}
      <div className="pulse-presence">
        <span className="pulse-presence-dot" />
        {viewerCount} {viewerCount === 1 ? 'person' : 'people'} here
      </div>

      {/* Hover tooltip */}
      {hoveredNode && (() => {
        const node = nodes.find((n) => n.id === hoveredNode);
        if (!node) return null;
        const hasVoted = votedWords.has(node.id);

        return (
          <div
            className="pulse-tooltip"
            style={{
              left: node.x,
              top: node.y - node.height / 2 - 30,
              transform: 'translateX(-50%)',
            }}
          >
            {node.votes} vote{node.votes !== 1 ? 's' : ''}
            {hasVoted && ' (voted)'}
          </div>
        );
      })()}

      {/* Empty state */}
      {words.length === 0 && (
        <div className="pulse-empty">
          Add the first word to get started
        </div>
      )}
    </div>
  );
}
