/**
 * Feature Flags
 * Toggle features on/off for different versions
 */

export const FEATURES = {
  /**
   * V2: Multi-page support within rooms
   * Allows creating multiple pages in a single room (workspace model)
   * Currently disabled for V1 - using single-document rooms
   */
  MULTI_PAGE_ROOMS: false,

  /**
   * V2: Personal pages alongside public playground
   * Allows users to have private pages separate from playground/rooms
   * Currently disabled for V1 - only playground (public) and rooms (private)
   */
  PERSONAL_PAGES: false,

  /**
   * V1: Public playground mode
   * Single shared document where strangers collaborate
   */
  PUBLIC_PLAYGROUND: true,

  /**
   * V1: Private rooms
   * URL-based collaborative spaces (one document per room)
   */
  PRIVATE_ROOMS: true,
} as const;

// Type helper for TypeScript
export type FeatureFlags = typeof FEATURES;
