/**
 * Community types — posts, comments, reactions, reports, blocks, topics.
 *
 * Mirrors the schema in supabase/migrations/20260503000000_community_phase1.sql.
 * Field names use camelCase here (RN convention); the syncService maps
 * to/from snake_case at the DB boundary.
 */

export type CommunityReactionKind = 'helpful' | 'like' | 'dose_warning';

export const REACTION_KIND_LABELS: Record<CommunityReactionKind, string> = {
  helpful:      'Helpful',
  like:         'Like',
  dose_warning: 'Dose warning',
};

export const REACTION_KIND_ICONS: Record<CommunityReactionKind, string> = {
  helpful:      'medkit-outline',
  like:         'heart-outline',
  dose_warning: 'warning-outline',
};

export type CommunityReportReason =
  | 'spam'
  | 'harassment'
  | 'unsafe_medical_advice'
  | 'misinformation'
  | 'off_topic'
  | 'other';

export const REPORT_REASON_LABELS: Record<CommunityReportReason, string> = {
  spam:                  'Spam',
  harassment:            'Harassment / abuse',
  unsafe_medical_advice: 'Unsafe medical advice',
  misinformation:        'Misinformation',
  off_topic:             'Off-topic',
  other:                 'Other',
};

export type CommunityTopicStatus = 'approved' | 'pending_review' | 'rejected';

export interface CommunityTopic {
  id: string;
  slug: string;
  name: string;
  description?: string;
  /** Ionicon name. */
  icon?: string;
  isDefault: boolean;
  isActive: boolean;
  status: CommunityTopicStatus;
  suggestedBy?: string;
  createdAt: string;
}

/** Author summary embedded in a post / comment. Avoids N+1 profile lookups. */
export interface CommunityAuthor {
  id: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface CommunityPost {
  id: string;
  userId: string;
  topicSlug: string;
  title: string;
  body: string;
  isDeleted: boolean;
  reactionCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  /** Hydrated by the read query when joining profiles. */
  author?: CommunityAuthor;
  /** Reactions the *current* user has placed on this post. Hydrated client-side. */
  myReactions?: CommunityReactionKind[];
}

export interface CommunityComment {
  id: string;
  postId: string;
  userId: string;
  parentCommentId?: string;
  body: string;
  isDeleted: boolean;
  reactionCount: number;
  createdAt: string;
  author?: CommunityAuthor;
  myReactions?: CommunityReactionKind[];
}

/**
 * Username validation. Same rules client-side and server-side:
 *   - 3-20 chars
 *   - alphanumeric + underscore only
 *   - must start with a letter (avoid all-digit ids that look like user ids)
 *   - reserved words blocked at the edge function (admin / mod / aimee / etc.)
 */
const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;

export function isValidUsername(s: string): boolean {
  return USERNAME_REGEX.test(s.trim());
}

export const USERNAME_RULES_HINT =
  '3-20 characters · letters, numbers, underscores · must start with a letter';

/**
 * Quick offensive-handle filter — basic word list. Server-side enforces
 * a more complete list via a profanity package; this catches the obvious
 * ones at composer time so the user gets a faster bounce.
 */
const OFFENSIVE_HANDLE_FRAGMENTS = [
  'admin', 'mod', 'staff', 'support',
  'fuck', 'shit', 'cunt', 'bitch', 'nigger', 'faggot',
  'nazi', 'kkk',
  'aimee', 'peptalk', 'pep_talk',
];

export function isOffensiveHandle(s: string): boolean {
  const lower = s.toLowerCase();
  return OFFENSIVE_HANDLE_FRAGMENTS.some((frag) => lower.includes(frag));
}
