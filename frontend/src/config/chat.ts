/**
 * Chat Configuration Constants
 *
 * Shared constants for GeneralChat and streaming hooks.
 * Single source of truth for limits and thresholds.
 */

/** Maximum number of tool results kept in memory per streaming session */
export const MAX_TOOL_RESULTS = 20;

/** Maximum number of cached artifact maps (LRU eviction beyond this) */
export const MAX_ARTIFACT_CACHE = 100;

/** Maximum image file size for upload (10 MB) */
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

/** Allowed image MIME type prefix */
export const IMAGE_MIME_PREFIX = 'image/';
