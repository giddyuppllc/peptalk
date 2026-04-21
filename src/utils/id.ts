/**
 * Shared ID generator.
 *
 * Previously duplicated across 8+ stores. Centralizing here means if we
 * ever need to change the format (e.g., move to real UUIDs) it's one edit,
 * not a grep-and-replace across the repo.
 *
 * Format: `{prefix}-{timestamp-ms}-{5-char random}` — collision-safe enough
 * for local IDs; Supabase rows get their own UUID PKs on write.
 */

export function uid(prefix = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
