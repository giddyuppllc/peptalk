/**
 * AimeeDnaIcon — glassy translucent blue DNA double helix.
 *
 * Used as the tab-bar icon for Aimee, replacing the chat-bubble icon.
 * Two stranded curves with cross-rungs draw a stylized double helix.
 * The strands use a soft blue gradient with low-alpha fills so the
 * icon reads "glass-clear" rather than flat.
 *
 * Inactive state: lower opacity. Active: full opacity + a faint inner
 * glow via stroke widening.
 */

import React from 'react';
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Path,
  Line,
  Circle,
} from 'react-native-svg';

interface AimeeDnaIconProps {
  size?: number;
  /** Override base color — defaults to medical-luxe Ice Melt deep. */
  color?: string;
  /** Active = brighter strokes + slightly opaque rungs. */
  active?: boolean;
}

export function AimeeDnaIcon({
  size = 24,
  color = '#3E7CB1',
  active = false,
}: AimeeDnaIconProps) {
  const strokeWidth = active ? 1.6 : 1.4;
  const strandOpacity = active ? 0.95 : 0.7;
  const rungOpacity = active ? 0.75 : 0.45;
  const beadOpacity = active ? 0.85 : 0.5;

  // Path for ONE helical strand sweeping top-to-bottom inside a 24x24 box.
  // S-curves form the helical sine wave; mirrored path forms the second
  // strand by horizontal flip via translateX.
  // Coords designed for viewBox 0 0 24 24.
  const strandLeft = 'M 6 2 Q 18 6 6 12 Q -6 18 6 22';
  const strandRight = 'M 18 2 Q 6 6 18 12 Q 30 18 18 22';

  // Cross-rungs (positions chosen at the helix narrow points where
  // strands cross, plus a couple in between for the "ladder" look).
  const rungs: Array<{ y: number; x1: number; x2: number; isCenter?: boolean }> = [
    { y: 5, x1: 9, x2: 15 },
    { y: 8, x1: 11, x2: 13, isCenter: true },
    { y: 11, x1: 7, x2: 17 },
    { y: 14, x1: 11, x2: 13, isCenter: true },
    { y: 17, x1: 9, x2: 15 },
    { y: 20, x1: 11, x2: 13, isCenter: true },
  ];

  const gradId = `aimee-dna-grad-${size}`;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#7FB3D8" stopOpacity={strandOpacity} />
          <Stop offset="0.5" stopColor={color} stopOpacity={strandOpacity} />
          <Stop offset="1" stopColor="#3E7CB1" stopOpacity={strandOpacity} />
        </LinearGradient>
      </Defs>

      {/* Cross-rungs first so the strands draw on top */}
      {rungs.map((r) => (
        <Line
          key={`rung-${r.y}`}
          x1={r.x1}
          y1={r.y}
          x2={r.x2}
          y2={r.y}
          stroke={color}
          strokeOpacity={rungOpacity}
          strokeWidth={r.isCenter ? 1.1 : 0.85}
          strokeLinecap="round"
        />
      ))}

      {/* Twin helical strands */}
      <Path
        d={strandLeft}
        stroke={`url(#${gradId})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d={strandRight}
        stroke={`url(#${gradId})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />

      {/* Glassy bead highlights at the helix crossover points */}
      <Circle cx={12} cy={8} r={1.2} fill={color} fillOpacity={beadOpacity} />
      <Circle cx={12} cy={14} r={1.2} fill={color} fillOpacity={beadOpacity} />
      <Circle cx={12} cy={20} r={1.0} fill={color} fillOpacity={beadOpacity * 0.7} />
    </Svg>
  );
}

export default AimeeDnaIcon;
