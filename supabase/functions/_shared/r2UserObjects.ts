/**
 * Which R2 objects belong to a user — pure, so jest can test it.
 *
 * community-upload-image mints every key as
 *   `${kind}/${userId}/${YYYY-MM-DD}/${uuid}.${ext}`
 * for kind in post | comment | avatar. delete-user used to remove the user's
 * rows and auth record but leave every one of those images in the bucket,
 * publicly readable at their CDN URL, while app/privacy.tsx says all of the
 * user's records are deleted.
 *
 * Keep COMMUNITY_IMAGE_KINDS in step with ALLOWED_KINDS in
 * community-upload-image/index.ts — a jest test compares them.
 */

export const COMMUNITY_IMAGE_KINDS = ['post', 'comment', 'avatar'] as const;

/** S3/R2 DeleteObjects accepts at most 1000 keys per request. */
export const R2_DELETE_BATCH = 1000;

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The list prefixes that hold this user's images. Throws on anything that is
 * not a UUID: an empty or malformed id would widen `post//` style prefixes
 * or match other users' objects, and this feeds a bulk delete.
 */
export function userImagePrefixes(userId: string): string[] {
  if (typeof userId !== 'string' || !USER_ID.test(userId)) {
    throw new Error('userImagePrefixes: refusing a non-UUID user id');
  }
  return COMMUNITY_IMAGE_KINDS.map((kind) => `${kind}/${userId}/`);
}

/** Only keys that sit under one of the prefixes, so a bad listing cannot widen a delete. */
export function keysOwnedBy(userId: string, keys: readonly string[]): string[] {
  const prefixes = userImagePrefixes(userId);
  return keys.filter((k) => prefixes.some((p) => k.startsWith(p) && k.length > p.length));
}

export function chunk<T>(items: readonly T[], size = R2_DELETE_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The two storage operations the purge needs — injected so it can be tested. */
export interface ObjectStore {
  listPage(prefix: string, continuationToken?: string): Promise<{
    keys: string[];
    nextToken?: string;
  }>;
  /** Deletes the keys; resolves to how many FAILED. */
  deleteKeys(keys: string[]): Promise<number>;
}

/**
 * Deletes every object under the user's image prefixes, page by page, in
 * batches of at most R2_DELETE_BATCH. Returns { deleted, failed }.
 */
export async function purgeUserImages(
  userId: string,
  store: ObjectStore,
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  for (const prefix of userImagePrefixes(userId)) {
    let token: string | undefined;
    do {
      const page = await store.listPage(prefix, token);
      const keys = keysOwnedBy(userId, page.keys);
      for (const batch of chunk(keys)) {
        const f = await store.deleteKeys(batch);
        failed += f;
        deleted += batch.length - f;
      }
      token = page.nextToken;
    } while (token);
  }
  return { deleted, failed };
}
