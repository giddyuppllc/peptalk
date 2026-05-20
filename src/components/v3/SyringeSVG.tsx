/**
 * SyringeSVG — U-100 insulin syringe illustration with optional fill marker.
 *
 * Used by:
 *   - Home Doses card preview (small)
 *   - Calculator's "Reconstitute" + "Draw your dose" cards (larger)
 *
 * `fillMl` shades the barrel from 0 to that value, draws a red marker
 * line at the fill level. U-100 scale: 1 mL = 100 ticks; bar is shown
 * with major ticks every 10 units. Theme-aware (bone outline on dark,
 * plum-navy outline on light).
 */

import React from 'react';
import { View } from 'react-native';
import Svg, { Line, Rect, Path, G } from 'react-native-svg';
import { useV3Theme } from '../../theme/V3ThemeProvider';

interface Props {
  /** Volume drawn into the barrel in mL. 0..1 typical (U-100 caps at 1.0 mL). */
  fillMl?: number;
  /** Total barrel capacity shown in mL. Default 1 (standard U-100). */
  capacityMl?: number;
  /** Layout width. Height auto-derives from aspect. */
  width?: number;
  /** Show the red "draw to here" marker line. */
  showMarker?: boolean;
}

const ASPECT = 4.2; // horizontal syringe: width / height

export function SyringeSVG({
  fillMl = 0,
  capacityMl = 1,
  width = 220,
  showMarker = true,
}: Props) {
  const t = useV3Theme();
  const height = width / ASPECT;

  const outline = t.isDark
    ? (t.colors.textPrimary as string)
    : (t.colors.textPrimary as string);

  const plungerCap = t.isDark
    ? (t.colors as any).accentCognacDeep
    : (t.colors as any).accentLavender;

  const liquidColor = t.isDark
    ? (t.colors as any).accentCognac
    : (t.colors as any).accentRose;

  // Layout: needle | barrel | plunger.
  // Reserve 12% for needle, 12% for plunger.
  const needleW = width * 0.10;
  const plungerW = width * 0.16;
  const barrelW = width - needleW - plungerW;
  const barrelX = needleW;
  const barrelY = height * 0.18;
  const barrelH = height * 0.64;

  const fillRatio = Math.max(0, Math.min(1, fillMl / capacityMl));
  const fillW = barrelW * fillRatio;

  // Major tick marks at 10, 20, ..., 100 units.
  const tickCount = 10;
  const tickStep = barrelW / tickCount;

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Needle */}
        <Line
          x1={0}
          y1={height / 2}
          x2={needleW}
          y2={height / 2}
          stroke={outline}
          strokeWidth={1.5}
        />
        {/* Hub */}
        <Rect
          x={needleW - 4}
          y={height * 0.34}
          width={6}
          height={height * 0.32}
          fill={outline}
          opacity={0.6}
        />
        {/* Barrel outline */}
        <Rect
          x={barrelX}
          y={barrelY}
          width={barrelW}
          height={barrelH}
          stroke={outline}
          strokeWidth={1.5}
          fill="none"
          rx={3}
        />
        {/* Liquid fill */}
        {fillW > 0 ? (
          <Rect
            x={barrelX + 1.5}
            y={barrelY + 1.5}
            width={Math.max(0, fillW - 3)}
            height={barrelH - 3}
            fill={liquidColor}
            opacity={0.55}
            rx={2}
          />
        ) : null}
        {/* Tick marks */}
        <G>
          {Array.from({ length: tickCount + 1 }).map((_, i) => (
            <Line
              key={i}
              x1={barrelX + i * tickStep}
              y1={barrelY}
              x2={barrelX + i * tickStep}
              y2={barrelY + barrelH * 0.18}
              stroke={outline}
              strokeWidth={0.8}
              opacity={0.7}
            />
          ))}
        </G>
        {/* Red marker — "draw to here" */}
        {showMarker && fillW > 0 ? (
          <Line
            x1={barrelX + fillW}
            y1={barrelY - 4}
            x2={barrelX + fillW}
            y2={barrelY + barrelH + 4}
            stroke="#D43A3A"
            strokeWidth={2}
          />
        ) : null}
        {/* Plunger rod (after the barrel) */}
        <Rect
          x={barrelX + barrelW}
          y={height * 0.42}
          width={plungerW * 0.6}
          height={height * 0.16}
          fill={outline}
          opacity={0.5}
        />
        {/* Plunger cap (at the very end) */}
        <Path
          d={`M ${barrelX + barrelW + plungerW * 0.6} ${height * 0.25} h ${plungerW * 0.4} v ${height * 0.5} h -${plungerW * 0.4} z`}
          fill={plungerCap}
        />
      </Svg>
    </View>
  );
}
