/**
 * withFemaleOnly — route guard for menstrual-cycle tracking.
 *
 * WHY A GUARD ON THE SCREEN AND NOT ON THE LINK
 * Hiding the Profile row is necessary but not sufficient. Aimee can navigate
 * the user directly (`/cycle` sits in both nav allowlists), and the route is a
 * plain deep link, so gating only the entry point leaves the surface reachable
 * by anyone who arrives another way. Guarding the destination covers every
 * inbound path at once — the row, Aimee, deep links, and anything added later.
 *
 * The nav allowlist was deliberately NOT changed: it is a pure function so the
 * app and `npm run verify:aimee` evaluate the same code, and reading a store
 * from it would break that purity for both.
 *
 * WHY AN HOC RATHER THAN AN EARLY RETURN INSIDE EACH SCREEN
 * An early `return null` partway through a component skips whatever hooks come
 * after it, so the hook order changes between renders and React throws. Wrapping
 * means the inner screen never mounts at all when access is refused, so its
 * hooks are simply never called.
 *
 * NULL GENDER
 * Treated as "not female", matching useTheme, which resolves anything that is
 * not 'Female' to the male theme. Onboarding makes Sex required to leave step 1
 * (`canContinue` checks `profile.gender`), so in practice null means onboarding
 * was never finished rather than a female user being locked out.
 */

import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useOnboardingStore } from '../store/useOnboardingStore';
import { isFemaleOnlyRouteAllowed } from '../lib/femaleOnlyRoute';

export function withFemaleOnly<P extends object>(
  Inner: React.ComponentType<P>,
): React.ComponentType<P> {
  function FemaleOnlyRoute(props: P) {
    const gender = useOnboardingStore((s) => s.profile.gender);
    // The store persists through async storage, so `gender` is null for the
    // first frames of a cold start regardless of who the user is. Deciding
    // before rehydration finishes would bounce a FEMALE user out of her own
    // cycle tracker — most visibly on a deep link, which is exactly the entry
    // path this guard exists to cover. Wait for the flag, then decide once.
    const hasHydrated = useOnboardingStore((s) => s.hasHydrated);
    const router = useRouter();
    const allowed = isFemaleOnlyRouteAllowed(gender);

    useEffect(() => {
      if (!hasHydrated || allowed) return;
      // Send them back where they came from rather than to a dead end. Only
      // fall through to Profile when this route was opened cold (a deep link
      // with nothing behind it on the stack).
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/profile' as never);
    }, [hasHydrated, allowed, router]);

    if (!hasHydrated || !allowed) return null;
    return <Inner {...props} />;
  }

  FemaleOnlyRoute.displayName = `withFemaleOnly(${Inner.displayName ?? Inner.name ?? 'Screen'})`;
  return FemaleOnlyRoute;
}

export default withFemaleOnly;
