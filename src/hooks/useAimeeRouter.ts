/**
 * useAimeeRouter — single entry point for opening Aimee with an intent.
 *
 * Maps the v3 intent vocabulary (used by AimeeFAB / Centerpiece / Persistent
 * Chip / chip rows) into a natural-language prompt and routes the user to
 * the existing /(tabs)/peptalk chat screen with the prompt prefilled.
 *
 * peptalk.tsx auto-sends the message on arrival, so the user's tap on a
 * chip → immediate Aimee response, no extra typing needed. The shared
 * useChatStore preserves the thread so the same conversation continues
 * across every surface (Master Refactor Plan v3.1 §9.10).
 */

import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { tapMedium } from '../utils/haptics';

import { INTENT_PROMPTS, type AimeeIntent } from '../lib/aimeeIntentPrompts';

export type { AimeeIntent };

export function useAimeeRouter() {
  const router = useRouter();
  return useCallback(
    (intent: AimeeIntent | { intent: AimeeIntent; messageOverride?: string }) => {
      tapMedium();
      const id = typeof intent === 'string' ? intent : intent.intent;
      const override =
        typeof intent === 'string' ? undefined : intent.messageOverride;
      const message = override ?? INTENT_PROMPTS[id] ?? '';
      // An override is the screen's observation line, sent as the prompt.
      // `src=obs` tells the on-device fallback it is screen copy rather than a
      // question the user typed (the model gets the same text either way).
      const qs = message
        ? `?message=${encodeURIComponent(message)}${override ? '&src=obs' : ''}`
        : '';
      router.push(`/(tabs)/peptalk${qs}` as never);
    },
    [router],
  );
}
