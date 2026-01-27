/**
 * Text diffing utilities for CRDT integration
 *
 * Converts full content replacement to insert/delete operations,
 * enabling proper CRDT conflict resolution with Fugue.
 */

export interface TextOperation {
  type: 'insert' | 'delete';
  position: number;
  text?: string;  // For insert
  length?: number; // For delete
}

/**
 * Compute the operations needed to transform oldText into newText
 *
 * Uses a simple but effective algorithm:
 * 1. Find common prefix
 * 2. Find common suffix
 * 3. The middle part is what changed (delete old middle, insert new middle)
 *
 * This works well for typical editing patterns (typing, backspace, paste).
 */
export function computeTextDiff(oldText: string, newText: string): TextOperation[] {
  if (oldText === newText) {
    return [];
  }

  // Handle empty cases
  if (oldText === '') {
    return [{ type: 'insert', position: 0, text: newText }];
  }

  if (newText === '') {
    return [{ type: 'delete', position: 0, length: oldText.length }];
  }

  // Find common prefix
  let prefixLen = 0;
  const minLen = Math.min(oldText.length, newText.length);

  while (prefixLen < minLen && oldText[prefixLen] === newText[prefixLen]) {
    prefixLen++;
  }

  // Find common suffix (but not overlapping with prefix)
  let suffixLen = 0;
  const maxSuffixLen = minLen - prefixLen;

  while (
    suffixLen < maxSuffixLen &&
    oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  // Calculate the changed portions
  const oldMiddleStart = prefixLen;
  const oldMiddleEnd = oldText.length - suffixLen;
  const newMiddleStart = prefixLen;
  const newMiddleEnd = newText.length - suffixLen;

  const deletedLength = oldMiddleEnd - oldMiddleStart;
  const insertedText = newText.slice(newMiddleStart, newMiddleEnd);

  const operations: TextOperation[] = [];

  // Delete the old middle part first
  if (deletedLength > 0) {
    operations.push({
      type: 'delete',
      position: prefixLen,
      length: deletedLength,
    });
  }

  // Insert the new middle part
  if (insertedText.length > 0) {
    operations.push({
      type: 'insert',
      position: prefixLen,
      text: insertedText,
    });
  }

  return operations;
}

/**
 * Apply text operations to a string
 * Useful for testing/validation
 */
export function applyOperations(text: string, operations: TextOperation[]): string {
  let result = text;

  for (const op of operations) {
    if (op.type === 'delete' && op.length !== undefined) {
      result = result.slice(0, op.position) + result.slice(op.position + op.length);
    } else if (op.type === 'insert' && op.text !== undefined) {
      result = result.slice(0, op.position) + op.text + result.slice(op.position);
    }
  }

  return result;
}

/**
 * Get cursor position after applying operations
 * Used to restore cursor position after CRDT sync
 */
export function getCursorPositionAfterDiff(
  oldText: string,
  newText: string,
  oldCursorPosition: number
): number {
  const ops = computeTextDiff(oldText, newText);

  let newPosition = oldCursorPosition;

  for (const op of ops) {
    if (op.type === 'delete' && op.length !== undefined) {
      if (op.position < newPosition) {
        // Deletion before cursor
        if (op.position + op.length <= newPosition) {
          // Entire deletion is before cursor
          newPosition -= op.length;
        } else {
          // Deletion includes cursor position
          newPosition = op.position;
        }
      }
    } else if (op.type === 'insert' && op.text !== undefined) {
      if (op.position <= newPosition) {
        // Insertion before or at cursor
        newPosition += op.text.length;
      }
    }
  }

  return Math.max(0, Math.min(newPosition, newText.length));
}
