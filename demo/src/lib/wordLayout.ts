/**
 * Word Layout - Force-directed layout algorithm with stability
 *
 * Creates a readable word cloud where:
 * - Words don't overlap (AABB collision detection)
 * - Layout settles into stable positions (no constant movement)
 * - New words animate in and find their place
 */

import type { WordEntry } from './wordwall';

// ============================================================================
// Types
// ============================================================================

export interface WordNode {
  id: string;
  text: string;
  votes: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  vx: number;
  vy: number;
  isSettled: boolean;
  isNew: boolean;
  entryProgress: number;
  lastVoteTime: number;
}

// ============================================================================
// Configuration
// ============================================================================

export const LAYOUT_CONFIG = {
  // Repulsion between overlapping/close words
  repulsionStrength: 3.0,
  repulsionRadius: 20, // Extra radius beyond text bounds

  // Attraction toward center (keeps words grouped)
  centerAttraction: 0.008,

  // Damping (slows down over time for settling)
  damping: 0.85,

  // Stability detection
  velocityThreshold: 0.15,
  settleFrames: 20,

  // Speed limits
  maxSpeed: 8,

  // Edge margins
  edgeMargin: 60,
  edgeForce: 1.5,

  // Font sizing
  baseFontSize: 16,
  maxFontSizeBonus: 16,

  // Entry animation
  entrySpeed: 0.04,
};

// ============================================================================
// Text Measurement
// ============================================================================

/**
 * Measure text dimensions using canvas context
 */
export function measureText(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  fontSize: number
): { width: number; height: number } {
  ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
  const metrics = ctx.measureText(text);
  return {
    width: metrics.width + 20, // Padding for click target
    height: fontSize * 1.3 + 12,
  };
}

/**
 * Calculate font size based on vote count
 */
export function getFontSize(votes: number): number {
  return LAYOUT_CONFIG.baseFontSize + Math.min(votes * 1.5, LAYOUT_CONFIG.maxFontSizeBonus);
}

// ============================================================================
// Collision Detection
// ============================================================================

/**
 * Check if two word nodes overlap (AABB collision)
 */
export function checkOverlap(a: WordNode, b: WordNode, padding: number = LAYOUT_CONFIG.repulsionRadius): boolean {
  const aLeft = a.x - a.width / 2 - padding;
  const aRight = a.x + a.width / 2 + padding;
  const aTop = a.y - a.height / 2 - padding;
  const aBottom = a.y + a.height / 2 + padding;

  const bLeft = b.x - b.width / 2;
  const bRight = b.x + b.width / 2;
  const bTop = b.y - b.height / 2;
  const bBottom = b.y + b.height / 2;

  return !(aRight < bLeft || aLeft > bRight || aBottom < bTop || aTop > bBottom);
}

/**
 * Get distance between two nodes (center to center)
 */
function getDistance(a: WordNode, b: WordNode): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ============================================================================
// Force Calculations
// ============================================================================

/**
 * Calculate repulsion force from nearby/overlapping nodes
 */
function calculateRepulsion(node: WordNode, others: WordNode[]): { fx: number; fy: number } {
  let fx = 0;
  let fy = 0;

  for (const other of others) {
    if (other.id === node.id) continue;

    const dx = node.x - other.x;
    const dy = node.y - other.y;
    const dist = Math.max(getDistance(node, other), 1);

    // Check if overlapping or very close
    const minDist = (node.width + other.width) / 2 + LAYOUT_CONFIG.repulsionRadius;

    if (dist < minDist) {
      // Strong repulsion when overlapping
      const strength = ((minDist - dist) / minDist) * LAYOUT_CONFIG.repulsionStrength;
      fx += (dx / dist) * strength;
      fy += (dy / dist) * strength;
    }
  }

  return { fx, fy };
}

/**
 * Calculate attraction toward center
 */
function calculateCenterAttraction(
  node: WordNode,
  centerX: number,
  centerY: number
): { fx: number; fy: number } {
  const dx = centerX - node.x;
  const dy = centerY - node.y;

  return {
    fx: dx * LAYOUT_CONFIG.centerAttraction,
    fy: dy * LAYOUT_CONFIG.centerAttraction,
  };
}

/**
 * Calculate edge containment force
 */
function calculateEdgeForce(
  node: WordNode,
  width: number,
  height: number
): { fx: number; fy: number } {
  let fx = 0;
  let fy = 0;
  const margin = LAYOUT_CONFIG.edgeMargin;
  const force = LAYOUT_CONFIG.edgeForce;

  // Left edge
  if (node.x - node.width / 2 < margin) {
    fx += force * (margin - (node.x - node.width / 2)) / margin;
  }
  // Right edge
  if (node.x + node.width / 2 > width - margin) {
    fx -= force * ((node.x + node.width / 2) - (width - margin)) / margin;
  }
  // Top edge
  if (node.y - node.height / 2 < margin) {
    fy += force * (margin - (node.y - node.height / 2)) / margin;
  }
  // Bottom edge
  if (node.y + node.height / 2 > height - margin) {
    fy -= force * ((node.y + node.height / 2) - (height - margin)) / margin;
  }

  return { fx, fy };
}

// ============================================================================
// Layout Update
// ============================================================================

/**
 * Update a single node's position based on forces
 */
export function updateNode(
  node: WordNode,
  allNodes: WordNode[],
  width: number,
  height: number
): WordNode {
  // Handle entry animation
  if (node.isNew && node.entryProgress < 1) {
    const updated = { ...node };
    updated.entryProgress += LAYOUT_CONFIG.entrySpeed;
    if (updated.entryProgress >= 1) {
      updated.isNew = false;
      updated.entryProgress = 1;
    }
    return updated;
  }

  // Skip if already settled
  if (node.isSettled) {
    return node;
  }

  const centerX = width / 2;
  const centerY = height / 2;

  // Calculate all forces
  const repulsion = calculateRepulsion(node, allNodes);
  const center = calculateCenterAttraction(node, centerX, centerY);
  const edge = calculateEdgeForce(node, width, height);

  // Sum forces
  const totalFx = repulsion.fx + center.fx + edge.fx;
  const totalFy = repulsion.fy + center.fy + edge.fy;

  // Apply forces with damping
  let vx = (node.vx + totalFx) * LAYOUT_CONFIG.damping;
  let vy = (node.vy + totalFy) * LAYOUT_CONFIG.damping;

  // Limit speed
  const speed = Math.sqrt(vx * vx + vy * vy);
  if (speed > LAYOUT_CONFIG.maxSpeed) {
    vx = (vx / speed) * LAYOUT_CONFIG.maxSpeed;
    vy = (vy / speed) * LAYOUT_CONFIG.maxSpeed;
  }

  // Update position
  const newX = node.x + vx;
  const newY = node.y + vy;

  return {
    ...node,
    x: newX,
    y: newY,
    vx,
    vy,
  };
}

/**
 * Update all nodes in the layout
 */
export function updateLayout(
  nodes: WordNode[],
  width: number,
  height: number
): WordNode[] {
  return nodes.map((node) => updateNode(node, nodes, width, height));
}

/**
 * Check if the layout has settled (all nodes moving slowly)
 */
export function isLayoutSettled(nodes: WordNode[]): boolean {
  if (nodes.length === 0) return true;

  return nodes.every((node) => {
    if (node.isNew) return false;
    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
    return speed < LAYOUT_CONFIG.velocityThreshold;
  });
}

// ============================================================================
// Node Creation
// ============================================================================

/**
 * Create a new word node from a WordEntry
 */
export function createWordNode(
  word: WordEntry,
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  existingNodes: WordNode[]
): WordNode {
  const fontSize = getFontSize(word.votes);
  const { width: textWidth, height: textHeight } = measureText(ctx, word.text, fontSize);

  // Find a starting position that doesn't overlap too much
  let startX = width / 2 + (Math.random() - 0.5) * (width * 0.4);
  let startY = height / 2 + (Math.random() - 0.5) * (height * 0.4);

  // Nudge away from existing nodes
  for (let i = 0; i < 5; i++) {
    let overlapping = false;
    for (const existing of existingNodes) {
      const dx = startX - existing.x;
      const dy = startY - existing.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 100) {
        // Too close, nudge away
        startX += (Math.random() - 0.5) * 50;
        startY += (Math.random() - 0.5) * 50;
        overlapping = true;
        break;
      }
    }
    if (!overlapping) break;
  }

  // Clamp to canvas bounds
  startX = Math.max(textWidth / 2 + 20, Math.min(width - textWidth / 2 - 20, startX));
  startY = Math.max(textHeight / 2 + 20, Math.min(height - textHeight / 2 - 20, startY));

  return {
    id: word.slug,
    text: word.text,
    votes: word.votes,
    x: startX,
    y: startY,
    width: textWidth,
    height: textHeight,
    fontSize,
    vx: 0,
    vy: 0,
    isSettled: false,
    isNew: true,
    entryProgress: 0,
    lastVoteTime: 0,
  };
}

/**
 * Update an existing node when votes change
 */
export function updateNodeVotes(
  node: WordNode,
  newVotes: number,
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
): WordNode {
  if (node.votes === newVotes) return node;

  const fontSize = getFontSize(newVotes);
  const { width, height } = measureText(ctx, node.text, fontSize);

  return {
    ...node,
    votes: newVotes,
    fontSize,
    width,
    height,
    lastVoteTime: Date.now(),
    isSettled: false, // Re-settle after vote change (size changed)
  };
}
