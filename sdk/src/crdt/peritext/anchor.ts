/**
 * Peritext StyleAnchor Implementation
 *
 * Based on the academic paper:
 * "Peritext: A CRDT for Collaborative Rich Text Editing"
 * Geoffrey Litt, Sarah Lim, Martin Kleppmann, Peter van Hardenberg
 * ACM CSCW 2022, DOI: 10.1145/3555644
 *
 * StyleAnchors are the fundamental building blocks of Peritext formatting.
 * They mark the start or end of a formatting span, paired by operation ID.
 */

/**
 * Anchor type - whether this anchor marks the start or end of a format span
 */
export type AnchorType = 'start' | 'end'

/**
 * StyleAnchor represents a formatting boundary in the text
 *
 * Each formatting span has two anchors (start and end) that are paired
 * by their operation ID. Anchors are attached to character IDs from the
 * underlying text CRDT (Fugue), making them stable across edits.
 *
 * Example:
 * ```
 * Text: "Hello world"
 * Bold span from position 0-5:
 *   Start anchor: { characterId: '1@client-a', type: 'start', opId: 'fmt-1' }
 *   End anchor:   { characterId: '5@client-a', type: 'end', opId: 'fmt-1' }
 * ```
 */
export class StyleAnchor {
  /**
   * The ID of the character this anchor is attached to
   * This comes from the Fugue text CRDT (format: "localId@clientId")
   */
  public readonly characterId: string

  /**
   * Whether this is the start or end of a formatting span
   */
  public readonly type: AnchorType

  /**
   * Operation ID that pairs this anchor with its counterpart
   * A start anchor and end anchor with the same opId form a formatting span
   */
  public readonly opId: string

  /**
   * Lamport timestamp for deterministic conflict resolution
   * Higher timestamps win in conflicts
   */
  public readonly timestamp: number

  /**
   * Client ID that created this anchor
   * Used for tie-breaking when timestamps are equal
   */
  public readonly clientId: string

  /**
   * Create a new StyleAnchor
   *
   * @param characterId - Character ID from Fugue text CRDT
   * @param type - 'start' or 'end'
   * @param opId - Operation ID (pairs start/end anchors)
   * @param timestamp - Lamport timestamp
   * @param clientId - Client that created this anchor
   */
  constructor(
    characterId: string,
    type: AnchorType,
    opId: string,
    timestamp: number,
    clientId: string
  ) {
    this.characterId = characterId
    this.type = type
    this.opId = opId
    this.timestamp = timestamp
    this.clientId = clientId
  }

  /**
   * Check if this anchor is a start anchor
   */
  isStart(): boolean {
    return this.type === 'start'
  }

  /**
   * Check if this anchor is an end anchor
   */
  isEnd(): boolean {
    return this.type === 'end'
  }

  /**
   * Get the counterpart type (start ↔ end)
   */
  getCounterpartType(): AnchorType {
    return this.type === 'start' ? 'end' : 'start'
  }

  /**
   * Compare this anchor with another for deterministic ordering
   *
   * Ordering rules (from Peritext paper):
   * 1. Position in text sequence (by character ID)
   * 2. Type: 'end' anchors come before 'start' anchors at same position
   * 3. Timestamp: higher timestamp wins
   * 4. Client ID: lexicographic ordering for tie-breaking
   *
   * @param other - Another StyleAnchor to compare with
   * @param getPosition - Function to get position from character ID
   * @returns -1 if this < other, 0 if equal, 1 if this > other
   */
  compare(
    other: StyleAnchor,
    getPosition: (charId: string) => number
  ): number {
    // 1. Compare by position in text
    const thisPos = getPosition(this.characterId)
    const otherPos = getPosition(other.characterId)

    if (thisPos !== otherPos) {
      return thisPos < otherPos ? -1 : 1
    }

    // 2. At same position: 'end' comes before 'start'
    // This ensures that when a span ends and another begins at the same
    // position, we close the first span before opening the second
    if (this.type !== other.type) {
      return this.type === 'end' ? -1 : 1
    }

    // 3. Same position and type: compare by timestamp
    if (this.timestamp !== other.timestamp) {
      return this.timestamp < other.timestamp ? -1 : 1
    }

    // 4. Tie-breaker: compare by client ID (lexicographic)
    if (this.clientId !== other.clientId) {
      return this.clientId < other.clientId ? -1 : 1
    }

    // 5. Same position, type, timestamp, and client: compare by opId
    // This should rarely happen, but ensures total ordering
    if (this.opId !== other.opId) {
      return this.opId < other.opId ? -1 : 1
    }

    return 0
  }

  /**
   * Create a copy of this anchor with a new character ID
   *
   * This is used when the character this anchor is attached to is deleted
   * and we need to move the anchor to a tombstone or adjacent character.
   *
   * @param newCharacterId - New character ID to attach to
   * @returns New StyleAnchor with updated character ID
   */
  withCharacterId(newCharacterId: string): StyleAnchor {
    return new StyleAnchor(
      newCharacterId,
      this.type,
      this.opId,
      this.timestamp,
      this.clientId
    )
  }

  /**
   * Serialize anchor to JSON for network transmission
   */
  toJSON(): AnchorJSON {
    return {
      c: this.characterId,
      t: this.type === 'start' ? 0 : 1,
      o: this.opId,
      ts: this.timestamp,
      cl: this.clientId
    }
  }

  /**
   * Deserialize anchor from JSON
   */
  static fromJSON(json: AnchorJSON): StyleAnchor {
    return new StyleAnchor(
      json.c,
      json.t === 0 ? 'start' : 'end',
      json.o,
      json.ts,
      json.cl
    )
  }

  /**
   * Create a human-readable string representation
   * Useful for debugging and logging
   */
  toString(): string {
    return `Anchor(${this.type}:${this.characterId}@${this.opId})`
  }

  /**
   * Check equality with another anchor
   * Two anchors are equal if all their properties match
   */
  equals(other: StyleAnchor): boolean {
    return (
      this.characterId === other.characterId &&
      this.type === other.type &&
      this.opId === other.opId &&
      this.timestamp === other.timestamp &&
      this.clientId === other.clientId
    )
  }

  /**
   * Clone this anchor
   * Creates a new instance with the same properties
   */
  clone(): StyleAnchor {
    return new StyleAnchor(
      this.characterId,
      this.type,
      this.opId,
      this.timestamp,
      this.clientId
    )
  }
}

/**
 * Compact JSON representation for network efficiency
 * Uses single-letter keys to minimize bytes over the wire
 */
export interface AnchorJSON {
  /** Character ID */
  c: string
  /** Type: 0 = start, 1 = end */
  t: 0 | 1
  /** Operation ID */
  o: string
  /** Timestamp */
  ts: number
  /** Client ID */
  cl: string
}

/**
 * Pair of anchors (start and end) that form a complete formatting span
 */
export interface AnchorPair {
  start: StyleAnchor
  end: StyleAnchor
}

/**
 * Helper functions for working with anchors
 */
export const AnchorUtils = {
  /**
   * Check if two anchors form a valid pair
   * A valid pair has the same opId and complementary types
   */
  isPair(anchor1: StyleAnchor, anchor2: StyleAnchor): boolean {
    return (
      anchor1.opId === anchor2.opId &&
      anchor1.type !== anchor2.type
    )
  },

  /**
   * Find the counterpart anchor for a given anchor in a list
   *
   * @param anchor - Anchor to find counterpart for
   * @param anchors - List of anchors to search
   * @returns Counterpart anchor or undefined if not found
   */
  findCounterpart(
    anchor: StyleAnchor,
    anchors: StyleAnchor[]
  ): StyleAnchor | undefined {
    const counterpartType = anchor.getCounterpartType()
    return anchors.find(
      a => a.opId === anchor.opId && a.type === counterpartType
    )
  },

  /**
   * Sort anchors by their position in the text
   *
   * @param anchors - Anchors to sort
   * @param getPosition - Function to get position from character ID
   * @returns Sorted anchors
   */
  sort(
    anchors: StyleAnchor[],
    getPosition: (charId: string) => number
  ): StyleAnchor[] {
    return [...anchors].sort((a, b) => a.compare(b, getPosition))
  },

  /**
   * Group anchors into pairs
   *
   * @param anchors - List of anchors to pair
   * @returns Array of anchor pairs
   */
  pairAnchors(anchors: StyleAnchor[]): AnchorPair[] {
    const pairs: AnchorPair[] = []
    const startAnchors = anchors.filter(a => a.isStart())

    for (const start of startAnchors) {
      const end = anchors.find(
        a => a.isEnd() && a.opId === start.opId
      )
      if (end) {
        pairs.push({ start, end })
      }
    }

    return pairs
  }
}
