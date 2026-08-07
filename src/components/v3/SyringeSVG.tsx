/**
 * SyringeSVG — a data-true U-100 insulin syringe.
 *
 * Used by:
 *   - Home Doses card preview (small)
 *   - Calculator's "Reconstitute" + "Draw your dose" cards (larger)
 *   - calculators/reconstitution.tsx
 *
 * WHY THIS IS DRAWN RATHER THAN PHOTOGRAPHED
 * A photograph of a syringe can show a syringe. It cannot show YOUR draw. This
 * renders the barrel graduated to real U-100 scale (1 mL = 100 units) and shades
 * it to exactly `fillMl`, so the picture and the arithmetic can never disagree —
 * the same reason the numbers themselves come from the curated dosing reference.
 * Get the volume wrong here and someone draws the wrong amount, so the drawing
 * is treated as an instrument, not decoration.
 *
 * Graduations adapt to size: minor ticks are dropped on small renders where they
 * would alias into a grey smear, and numerals only appear when there is room to
 * set them legibly. A crowded scale reads as "roughly here", which is precisely
 * the wrong impression.
 *
 * Backward compatible — `fillMl` / `capacityMl` / `width` / `showMarker` behave
 * as before; everything new is optional.
 */

import React from 'react';
import { View } from 'react-native';
import Svg, {
  Line,
  Rect,
  Path,
  G,
  Defs,
  LinearGradient,
  Stop,
  Text as SvgText,
  Circle,
} from 'react-native-svg';
import { useV3Theme } from '../../theme/V3ThemeProvider';

interface Props {
  /** Volume drawn into the barrel in mL. 0..1 typical (U-100 caps at 1.0 mL). */
  fillMl?: number;
  /** Total barrel capacity shown in mL. Default 1 (standard U-100). */
  capacityMl?: number;
  /** Layout width. Height auto-derives from aspect. */
  width?: number;
  /** Show the "draw to here" marker line. */
  showMarker?: boolean;
  /**
   * Label the marker with its unit value. Defaults to deriving units from
   * `fillMl` on the U-100 scale; pass explicitly to show the calculator's own
   * rounded figure so the badge matches the number printed beside it.
   */
  units?: number;
  /** Draw numerals under the major graduations. Auto-enabled at width >= 200. */
  showScale?: boolean;
}

const ASPECT = 3.4; // horizontal syringe: width / height

export function SyringeSVG({
  fillMl = 0,
  capacityMl = 1,
  width = 220,
  showMarker = true,
  units,
  showScale,
}: Props) {
  const t = useV3Theme();
  const height = width / ASPECT;

  const ink = t.colors.textPrimary as string;
  const liquidColor = t.isDark
    ? ((t.colors as any).accentCognac as string)
    : ((t.colors as any).accentRose as string);
  const plungerCap = t.isDark
    ? ((t.colors as any).accentCognacDeep as string)
    : ((t.colors as any).accentLavender as string);

  // Layout: needle | barrel | plunger.
  const needleW = width * 0.11;
  const plungerW = width * 0.17;
  const barrelW = width - needleW - plungerW;
  const barrelX = needleW;
  const barrelH = height * 0.46;
  const barrelY = height * 0.20;
  const midY = barrelY + barrelH / 2;

  const capacityUnits = capacityMl * 100; // U-100
  const fillRatio = Math.max(0, Math.min(1, capacityMl > 0 ? fillMl / capacityMl : 0));
  const fillW = barrelW * fillRatio;
  const drawnUnits = units ?? Math.round(fillMl * 100);

  // Density decisions. Below these widths the marks would collide and read as a
  // texture rather than a scale, which overstates precision.
  const withScale = showScale ?? width >= 200;
  const minorEvery = width >= 260 ? 2 : width >= 180 ? 5 : 0; // units; 0 = none
  const majorEvery = 10;

  const unitToX = (u: number) => barrelX + (u / capacityUnits) * barrelW;

  const minorTicks: number[] = [];
  if (minorEvery > 0) {
    for (let u = minorEvery; u < capacityUnits; u += minorEvery) {
      if (u % majorEvery !== 0) minorTicks.push(u);
    }
  }
  const majorTicks: number[] = [];
  for (let u = 0; u <= capacityUnits; u += majorEvery) majorTicks.push(u);

  // A dose can exceed one barrel. Clamp the marker's POSITION so it stays on the
  // syringe, but keep the true figure in the badge — silently pinning the label
  // to 100u would tell someone a 160u draw fits, which is the one thing they
  // must not believe. `overCapacity` colours the badge so it reads as a problem
  // rather than a normal draw.
  const overCapacity = drawnUnits > capacityUnits;
  const markerX = unitToX(Math.min(drawnUnits, capacityUnits));
  const markerColor = overCapacity ? '#B3261E' : '#D43A3A';
  const badgeW = Math.max(34, String(drawnUnits).length * 9 + (overCapacity ? 34 : 20));
  const badgeH = height * 0.26;
  // Keep the badge inside the canvas at either extreme of the barrel.
  const badgeX = Math.min(
    Math.max(markerX - badgeW / 2, 0),
    Math.max(0, width - badgeW),
  );

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          {/* Glass barrel: light catches the top edge, shadow gathers at the
              bottom. Two stops would read as a flat ramp, so the midpoint is
              held near-neutral to suggest a cylinder rather than a wedge. */}
          <LinearGradient id="barrelGlass" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={ink} stopOpacity={0.10} />
            <Stop offset="0.35" stopColor={ink} stopOpacity={0.02} />
            <Stop offset="1" stopColor={ink} stopOpacity={0.09} />
          </LinearGradient>
          <LinearGradient id="liquid" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={liquidColor} stopOpacity={0.85} />
            <Stop offset="0.5" stopColor={liquidColor} stopOpacity={0.62} />
            <Stop offset="1" stopColor={liquidColor} stopOpacity={0.8} />
          </LinearGradient>
          <LinearGradient id="steel" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={ink} stopOpacity={0.35} />
            <Stop offset="0.5" stopColor={ink} stopOpacity={0.75} />
            <Stop offset="1" stopColor={ink} stopOpacity={0.35} />
          </LinearGradient>
        </Defs>

        {/* ── Needle: tapered, with a bevelled tip ── */}
        <Path
          d={`M 0 ${midY} L ${needleW * 0.75} ${midY - 1.1} L ${needleW * 0.75} ${midY + 1.1} Z`}
          fill="url(#steel)"
        />
        <Rect
          x={needleW * 0.7}
          y={midY - 1.6}
          width={needleW * 0.3}
          height={3.2}
          fill="url(#steel)"
        />
        {/* Hub — the coloured collar that seats on the barrel */}
        <Rect
          x={needleW - 3}
          y={barrelY + barrelH * 0.18}
          width={7}
          height={barrelH * 0.64}
          rx={2}
          fill={ink}
          opacity={0.45}
        />

        {/* ── Barrel ── */}
        <Rect
          x={barrelX}
          y={barrelY}
          width={barrelW}
          height={barrelH}
          rx={barrelH * 0.22}
          fill="url(#barrelGlass)"
          stroke={ink}
          strokeOpacity={0.55}
          strokeWidth={1.4}
        />

        {/* Liquid, inset so it sits INSIDE the glass rather than on the stroke */}
        {fillW > 1 ? (
          <>
            <Rect
              x={barrelX + 1.4}
              y={barrelY + 1.4}
              width={Math.max(0, fillW - 2.8)}
              height={barrelH - 2.8}
              rx={barrelH * 0.18}
              fill="url(#liquid)"
            />
            {/* Meniscus — the leading edge of a real column of liquid is not a
                straight cut. Subtle, but it is the difference between "shaded
                rectangle" and "there is fluid in here". */}
            <Path
              d={`M ${barrelX + fillW - 2.8} ${barrelY + 1.4}
                  q ${barrelH * 0.16} ${barrelH / 2 - 1.4} 0 ${barrelH - 2.8}`}
              fill={liquidColor}
              opacity={0.5}
            />
          </>
        ) : null}

        {/* ── Graduations ── */}
        <G>
          {minorTicks.map((u) => (
            <Line
              key={`m${u}`}
              x1={unitToX(u)}
              y1={barrelY + 1}
              x2={unitToX(u)}
              y2={barrelY + barrelH * 0.20}
              stroke={ink}
              strokeWidth={0.7}
              opacity={0.4}
            />
          ))}
          {majorTicks.map((u) => (
            <Line
              key={`M${u}`}
              x1={unitToX(u)}
              y1={barrelY + 1}
              x2={unitToX(u)}
              y2={barrelY + barrelH * 0.40}
              stroke={ink}
              strokeWidth={1.1}
              opacity={0.75}
            />
          ))}
        </G>

        {/* Numerals sit BELOW the barrel so they never fight the liquid. */}
        {withScale
          ? majorTicks
              .filter((u) => u > 0 && u < capacityUnits)
              .map((u) => (
                <SvgText
                  key={`t${u}`}
                  x={unitToX(u)}
                  y={barrelY + barrelH + height * 0.17}
                  fontSize={height * 0.15}
                  fill={ink}
                  opacity={0.55}
                  textAnchor="middle"
                >
                  {u}
                </SvgText>
              ))
          : null}

        {/* ── Plunger ── */}
        <Rect
          x={barrelX + barrelW}
          y={midY - barrelH * 0.10}
          width={plungerW * 0.62}
          height={barrelH * 0.20}
          fill={ink}
          opacity={0.4}
          rx={1.5}
        />
        <Rect
          x={barrelX + barrelW + plungerW * 0.62}
          y={barrelY - barrelH * 0.12}
          width={plungerW * 0.34}
          height={barrelH * 1.24}
          rx={3}
          fill={plungerCap}
        />

        {/* ── "Draw to here" ──
            Drawn last so it sits above the liquid and the graduations. This is
            the one mark the user actually acts on. */}
        {showMarker && drawnUnits > 0 ? (
          <G>
            <Line
              x1={markerX}
              y1={barrelY - height * 0.06}
              x2={markerX}
              y2={barrelY + barrelH + height * 0.04}
              stroke={markerColor}
              strokeWidth={2}
            />
            <Circle cx={markerX} cy={barrelY + barrelH + height * 0.04} r={2.2} fill={markerColor} />
            <Rect
              x={badgeX}
              y={0}
              width={badgeW}
              height={badgeH}
              rx={badgeH / 2}
              fill={markerColor}
            />
            <SvgText
              x={badgeX + badgeW / 2}
              y={badgeH * 0.72}
              fontSize={height * 0.17}
              fontWeight="700"
              fill="#FFFFFF"
              textAnchor="middle"
            >
              {overCapacity ? `${drawnUnits}u — over` : `${drawnUnits}u`}
            </SvgText>
          </G>
        ) : null}
      </Svg>
    </View>
  );
}
