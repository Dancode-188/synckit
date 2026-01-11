/**
 * Anonymous user identity generation
 * Creates fun animal names with colors and short IDs (e.g., "Happy Panda #a3f")
 */

const ADJECTIVES = [
  'Happy', 'Clever', 'Swift', 'Bright', 'Calm', 'Bold',
  'Gentle', 'Wise', 'Lucky', 'Brave', 'Kind', 'Cool',
  'Peaceful', 'Cheerful', 'Noble', 'Eager', 'Friendly', 'Joyful'
];

const ANIMALS = [
  'Panda', 'Fox', 'Wolf', 'Bear', 'Eagle', 'Lion',
  'Tiger', 'Dolphin', 'Owl', 'Hawk', 'Rabbit', 'Deer',
  'Otter', 'Koala', 'Penguin', 'Lynx', 'Falcon', 'Seal'
];

const COLORS = [
  '#FF6B6B', // red
  '#4ECDC4', // teal
  '#45B7D1', // blue
  '#FFA07A', // coral
  '#98D8C8', // mint
  '#F7DC6F', // yellow
  '#BB8FCE', // purple
  '#85C1E2', // sky blue
  '#F8B88B', // peach
  '#FAD7A1', // cream
  '#D7BDE2', // lavender
  '#AED6F1', // light blue
  '#F9E79F', // pale yellow
  '#E8DAEF', // pale purple
  '#A9DFBF', // light green
  '#FAD7A0', // tan
  '#D5DBDB', // grey
  '#85929E', // slate
];

/**
 * Generate a random anonymous user identity
 * @param clientId - Optional client ID to use for deterministic generation
 * @returns User identity with name and color
 */
export function generateAnonymousUser(clientId?: string): {
  name: string;
  color: string;
  shortId: string;
} {
  // Use client ID for deterministic generation if provided
  const seed = clientId ? hashCode(clientId) : Math.random();

  // Generate components
  const adjective = ADJECTIVES[Math.floor(Math.abs(seed) * ADJECTIVES.length) % ADJECTIVES.length];
  const animal = ANIMALS[Math.floor(Math.abs(seed * 2) * ANIMALS.length) % ANIMALS.length];
  const color = COLORS[Math.floor(Math.abs(seed * 3) * COLORS.length) % COLORS.length];

  // Generate short ID (3 characters from client ID or random)
  let shortId: string;
  if (clientId) {
    // Use first 3 hex chars from client ID
    const hex = clientId.replace(/[^a-f0-9]/gi, '');
    shortId = hex.substring(0, 3).toLowerCase() || randomHex(3);
  } else {
    shortId = randomHex(3);
  }

  const name = `${adjective} ${animal} #${shortId}`;

  return { name, color, shortId };
}

/**
 * Simple hash function for strings (for deterministic generation)
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) / 2147483647; // Normalize to 0-1
}

/**
 * Generate random hex string of specified length
 */
function randomHex(length: number): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Get stored user identity from localStorage or generate new one
 */
export function getUserIdentity(clientId: string): {
  name: string;
  color: string;
  shortId: string;
} {
  const storageKey = 'localwrite:user-identity';

  // Try to load from localStorage
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const identity = JSON.parse(stored);
      if (identity.name && identity.color && identity.shortId) {
        return identity;
      }
    }
  } catch (error) {
    console.warn('Failed to load user identity from localStorage:', error);
  }

  // Generate new identity
  const identity = generateAnonymousUser(clientId);

  // Store for consistency across sessions
  try {
    localStorage.setItem(storageKey, JSON.stringify(identity));
  } catch (error) {
    console.warn('Failed to store user identity:', error);
  }

  return identity;
}
