/**
 * useTourTarget — registers an element's screen position with the tour store
 * so the SpotlightTour overlay can draw a highlight around it.
 *
 * Usage:
 *   const ref = useTourTarget('home_fab');
 *   return <View ref={ref}>...</View>;
 *
 * The hook measures the element's window-relative position on mount and any
 * time the tour's active step or screen changes. Measurement uses
 * `measureInWindow` which returns correct coordinates regardless of parent
 * transforms or scroll offsets.
 */

import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useTutorialStore } from '../store/useTutorialStore';

export function useTourTarget(id: string) {
  const ref = useRef<View>(null);
  const registerTarget = useTutorialStore((s) => s.registerTarget);
  const unregisterTarget = useTutorialStore((s) => s.unregisterTarget);
  const tourActive = useTutorialStore((s) => s.tourActive);
  const currentStep = useTutorialStore((s) => s.currentStep);

  const measure = useCallback(() => {
    if (!ref.current) return;
    ref.current.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        registerTarget(id, { x, y, width, height });
      }
    });
  }, [id, registerTarget]);

  // Re-measure whenever the tour activates or advances — the element may
  // have moved if we navigated between screens or a list scrolled.
  useEffect(() => {
    if (!tourActive) return;
    // Measure next frame so layout has settled
    const timer = requestAnimationFrame(() => {
      measure();
      // Also measure again after ~200ms to catch post-animation positions
      setTimeout(measure, 200);
    });
    return () => cancelAnimationFrame(timer);
  }, [tourActive, currentStep, measure]);

  // Clean up on unmount so stale rects don't linger
  useEffect(() => {
    return () => {
      unregisterTarget(id);
    };
  }, [id, unregisterTarget]);

  return ref;
}

export default useTourTarget;
