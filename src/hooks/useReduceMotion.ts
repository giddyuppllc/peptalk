/**
 * useReduceMotion — listens to the OS-level "Reduce Motion" accessibility
 * setting and re-renders when it flips.
 *
 * Use this to disable scale springs, parallax, splash animations, etc.
 * for users who get vestibular discomfort from motion. Apple HIG +
 * Android both expose the setting; React Native's AccessibilityInfo
 * surfaces it cross-platform.
 *
 * Returns the current boolean. Defaults to false until the OS replies.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (mounted) setReduce(!!v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      setReduce(!!v);
    });
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  return reduce;
}
