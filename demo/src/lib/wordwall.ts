/**
 * Word Wall utilities
 * Handles word submission, voting, filtering, and display logic
 */

// ============================================================================
// Types
// ============================================================================

export interface WordEntry {
  slug: string;
  text: string;
  votes: number;
  submittedAt: number;
  submittedBy: string;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_WORD_LENGTH = 30;
const MAX_WORDS = 200;
const MIN_FONT_SIZE = 14;
const MAX_FONT_SIZE = 48;

// ============================================================================
// Offensive Word Filter
// ============================================================================

// Basic blocklist — not exhaustive, but catches the most common abuse
const BLOCKLIST = new Set([
  'fuck', 'shit', 'ass', 'bitch', 'dick', 'pussy', 'cock', 'cunt',
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'retarded',
  'whore', 'slut', 'bastard', 'damn', 'piss',
  'nazi', 'hitler', 'kys', 'kill',
]);

export function isOffensive(text: string): boolean {
  const lower = text.toLowerCase().trim();
  // Check exact match
  if (BLOCKLIST.has(lower)) return true;
  // Check if any blocked word appears as a substring
  for (const word of BLOCKLIST) {
    if (lower.includes(word)) return true;
  }
  return false;
}

// ============================================================================
// Slug / Text Processing
// ============================================================================

export function textToSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40);
}

export function sanitizeInput(text: string): string {
  return text.trim().slice(0, MAX_WORD_LENGTH);
}

// ============================================================================
// Document Parsing
// ============================================================================

export function parseWordsFromDocument(
  data: Record<string, unknown>
): WordEntry[] {
  const words: WordEntry[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith('word:')) continue;
    if (!value || typeof value !== 'object') continue;

    const v = value as any;
    // Skip deleted entries
    if (v.__deleted) continue;
    if (!v.text || typeof v.votes !== 'number') continue;

    words.push({
      slug: key.replace('word:', ''),
      text: v.text,
      votes: v.votes,
      submittedAt: v.submittedAt || 0,
      submittedBy: v.submittedBy || '',
    });
  }

  return words.sort((a, b) => b.votes - a.votes);
}

// ============================================================================
// Eviction
// ============================================================================

export function findWordToEvict(words: WordEntry[]): WordEntry | null {
  if (words.length < MAX_WORDS) return null;

  // Evict: lowest votes first, then oldest
  const sorted = [...words].sort((a, b) => {
    if (a.votes !== b.votes) return a.votes - b.votes;
    return a.submittedAt - b.submittedAt;
  });

  return sorted[0] || null;
}

export function needsEviction(words: WordEntry[]): boolean {
  return words.length >= MAX_WORDS;
}

// ============================================================================
// Display
// ============================================================================

export function getWordFontSize(
  votes: number,
  maxVotes: number
): number {
  if (maxVotes <= 1) return (MIN_FONT_SIZE + MAX_FONT_SIZE) / 2;
  const ratio = Math.min(votes / maxVotes, 1);
  return MIN_FONT_SIZE + ratio * (MAX_FONT_SIZE - MIN_FONT_SIZE);
}

// 18 distinct colors for words (same count as user palette)
const WORD_COLORS = [
  '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  '#06b6d4', '#d946ef', '#0ea5e9', '#22c55e', '#a855f7',
  '#e11d48', '#2dd4bf', '#facc15',
];

export function getWordColor(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  }
  return WORD_COLORS[Math.abs(hash) % WORD_COLORS.length];
}
