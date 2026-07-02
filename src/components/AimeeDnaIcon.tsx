/**
 * AimeeDnaIcon — glassy blue DNA double helix.
 *
 * Used as the tab-bar icon for Aimee and inside the "Ask Aimee" buttons.
 *
 * The strands are two true sine waves running the height of the box,
 * phase-shifted by half a period so they cross REPEATEDLY (two full
 * twists) — a proper double helix. The previous version bowed out and
 * pinched back at a single mid-point, which testers read as an
 * anatomical (uterus/ovary) symbol (build 59). Real DNA crosses over
 * and over, so we sample two full periods and connect them with a
 * ladder of base-pair rungs plus crossover beads.
 *
 * Cooler look: a cyan→blue vertical gradient on the strands, brighter
 * crossover beads, and a slightly bolder active stroke.
 *
 * Inactive state: lower opacity. Active: full opacity + wider strokes.
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

// ── Helix geometry (viewBox 0 0 24 24) ──────────────────────────────
const TOP = 3;
const BOTTOM = 21;
const CX = 12;
const AMP = 5.5; // strands sweep x = 6.5 … 17.5
const PERIODS = 2; // two full twists reads unmistakably as a helix
const SAMPLES = 44;

const strandX = (t: number, phase: number) =>
  CX + AMP * Math.sin(2 * Math.PI * PERIODS * t + phase);
const yAt = (t: number) => TOP + (BOTTOM - TOP) * t;

// Smooth polyline for one strand (rounded joins make it read as a curve).
function buildStrand(phase: number): string {
  let d = '';
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    d += `${i === 0 ? 'M' : 'L'} ${strandX(t, phase).toFixed(2)} ${yAt(t).toFixed(2)} `;
  }
  return d.trim();
}

const STRAND_A = buildStrand(0);
const STRAND_B = buildStrand(Math.PI);

// Base-pair rungs at the "belly" points where the two strands are widest.
const RUNGS = [1, 3, 5, 7].map((k) => {
  const t = k / 8;
  const x1 = strandX(t, 0);
  const x2 = strandX(t, Math.PI);
  // Inset the rung a hair so it tucks under the strands instead of poking
  // past them.
  const inset = 0.6 * Math.sign(x2 - x1);
  return { x1: x1 + inset, x2: x2 - inset, y: yAt(t) };
});

// Crossover beads where the strands meet (interior junctions only).
const CROSSOVERS = [1, 2, 3].map((k) => yAt(k / 4));

export function AimeeDnaIcon({
  size = 24,
  color = '#3E7CB1',
  active = false,
}: AimeeDnaIconProps) {
  const strokeWidth = active ? 1.8 : 1.5;
  const strandOpacity = active ? 0.98 : 0.72;
  const rungOpacity = active ? 0.6 : 0.38;
  const beadOpacity = active ? 0.95 : 0.55;

  const gradId = `aimee-dna-grad-${size}`;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#8FD8EC" stopOpacity={strandOpacity} />
          <Stop offset="0.5" stopColor={color} stopOpacity={strandOpacity} />
          <Stop offset="1" stopColor="#2E6091" stopOpacity={strandOpacity} />
        </LinearGradient>
      </Defs>

      {/* Base-pair rungs first so the strands draw on top */}
      {RUNGS.map((r, i) => (
        <Line
          key={`rung-${i}`}
          x1={r.x1}
          y1={r.y}
          x2={r.x2}
          y2={r.y}
          stroke={color}
          strokeOpacity={rungOpacity}
          strokeWidth={0.9}
          strokeLinecap="round"
        />
      ))}

      {/* Twin helical strands (two full twists, repeated crossovers) */}
      <Path
        d={STRAND_A}
        stroke={`url(#${gradId})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d={STRAND_B}
        stroke={`url(#${gradId})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Glassy bead highlights at the crossover junctions */}
      {CROSSOVERS.map((cy, i) => (
        <Circle
          key={`bead-${i}`}
          cx={CX}
          cy={cy}
          r={1.15}
          fill={color}
          fillOpacity={beadOpacity}
        />
      ))}
    </Svg>
  );
}

export default AimeeDnaIcon;
