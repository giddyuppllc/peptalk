/**
 * AimeeSparkIcon — the "AI assistant" spark used on the Aimee FAB.
 *
 * A bold four-point sparkle with a smaller companion spark — the
 * universally-read shorthand for an AI assistant. Replaces the earlier
 * DNA-helix branding on the FAB, which testers read as an anatomical
 * symbol; a spark says "smart health assistant" with zero ambiguity.
 *
 * Renders as a solid glyph (defaults to white) so it sits cleanly on the
 * Aimee gradient FAB. Scales to any size via the viewBox.
 */

import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface AimeeSparkIconProps {
  size?: number;
  color?: string;
}

// Four-point sparkle centered at 12,12 with concave sides (radius ~9),
// plus a small companion spark up and to the right.
const MAIN_SPARK =
  'M12 2.6 C12 7.8 16.2 12 21.4 12 C16.2 12 12 16.2 12 21.4 C12 16.2 7.8 12 2.6 12 C7.8 12 12 7.8 12 2.6 Z';
const MINI_SPARK =
  'M19.3 2 C19.3 3.7 20.3 4.7 22 4.7 C20.3 4.7 19.3 5.7 19.3 7.4 C19.3 5.7 18.3 4.7 16.6 4.7 C18.3 4.7 19.3 3.7 19.3 2 Z';

export function AimeeSparkIcon({ size = 24, color = '#fff' }: AimeeSparkIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={MAIN_SPARK} fill={color} />
      <Path d={MINI_SPARK} fill={color} fillOpacity={0.85} />
    </Svg>
  );
}

export default AimeeSparkIcon;
