/**
 * Floating Reaction Component
 * Animated emoji that floats up and fades out
 */

import { useEffect, useState } from 'react';

interface FloatingReactionProps {
  emoji: string;
  position: { x: number; y: number };
  onComplete: () => void;
}

export function FloatingReaction({ emoji, position, onComplete }: FloatingReactionProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setVisible(false);
      onComplete();
    }, 2000);

    return () => clearTimeout(timeout);
  }, [onComplete]);

  if (!visible) return null;

  return (
    <div
      className="fixed pointer-events-none z-[100] animate-reaction-float text-4xl"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {emoji}
    </div>
  );
}
