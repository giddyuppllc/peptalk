/**
 * In-app review prompts via expo-store-review.
 *
 * Design goals:
 *   - Only ask when the user has done something that suggests they're
 *     happy with the app (completed a week of check-ins, logged their
 *     first workout, restored a subscription successfully, etc.).
 *   - Never ask twice within 120 days — Apple/Google rate-limit internally
 *     but we add our own cooldown so a legit "moment of delight" doesn't
 *     burn a silent no-op.
 *   - Respect user-level opt-out (we set `review_prompt_disabled` from
 *     settings later if users ask).
 *
 * Call sites: after successful completions, not after errors.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_PROMPT_KEY = 'peptalk_last_review_prompt_ms';
const OPT_OUT_KEY = 'peptalk_review_prompt_disabled';
const COOLDOWN_MS = 120 * 24 * 60 * 60 * 1000; // 120 days

let StoreReview: any = null;
try {
   
  StoreReview = require('expo-store-review');
} catch {
  // Module unavailable in Expo Go / web / jest — all calls no-op.
}

export async function maybeAskForReview(reason?: string): Promise<void> {
  if (!StoreReview) return;

  try {
    const disabled = await AsyncStorage.getItem(OPT_OUT_KEY);
    if (disabled === '1') return;

    const lastRaw = await AsyncStorage.getItem(LAST_PROMPT_KEY);
    const lastMs = lastRaw ? parseInt(lastRaw, 10) : 0;
    if (lastMs && Date.now() - lastMs < COOLDOWN_MS) return;

    // Will silently no-op if the OS has already hit its own cap this year.
    const available = await StoreReview.isAvailableAsync?.();
    if (!available) return;

    await StoreReview.requestReview();
    await AsyncStorage.setItem(LAST_PROMPT_KEY, String(Date.now()));

    if (__DEV__) console.log('[reviewPrompt] requested (reason:', reason, ')');
  } catch (err) {
    if (__DEV__) console.warn('[reviewPrompt] threw:', err);
  }
}

export async function disableReviewPrompt(): Promise<void> {
  try {
    await AsyncStorage.setItem(OPT_OUT_KEY, '1');
  } catch {}
}
