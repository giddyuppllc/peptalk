/**
 * ActivityRings — 3 concentric rings (move / exercise / stand-equivalent).
 *
 * Female: rose / mint / blue concentric.
 * Male: cognac / oxblood / tungsten concentric.
 *
 * Phase A: static placeholder values. Phase E wires real HealthKit /
 * Google Fit pulls.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useV3Theme } from '../../theme/V3ThemeProvider';

interface Props {
  /** 0-100, default 70 */
  move?: number;
  /** 0-100, default 55 */
  exercise?: number;
  /** 0-100, default 40 */
  stand?: number;
  size?: number;
}

export function ActivityRings({
  move = 70,
  exercise = 55,
  stand = 40,
  size = 96,
}: Props) {
  const t = useV3Theme();
  const strokeWidth = 7;
  const gap = 2;

  const rings = [
    { value: move, radius: (size - strokeWidth) / 2 },
    { value: exercise, radius: (size - strokeWidth) / 2 - strokeWidth - gap },
    {
      value: stand,
      radius: (size - strokeWidth) / 2 - (strokeWidth + gap) * 2,
    },
  ];

  const colors = t.isDark
    ? [
        (t.colors as any).accentCognac,
        (t.colors as any).accentOxblood,
        (t.colors as any).accentTungstenLight,
      ]
    : [
        (t.colors as any).accentRose,
        (t.colors as any).accentMint,
        (t.colors as any).accentBabyBlue,
      ];
  const trackColor = t.isDark
    ? 'rgba(255,255,255,0.06)'
    : 'rgba(42,26,79,0.06)';

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {rings.map((ring, i) => {
          if (ring.radius <= 0) return null;
          const circumference = 2 * Math.PI * ring.radius;
          const offset = circumference * (1 - Math.min(100, ring.value) / 100);
          return (
            <React.Fragment key={i}>
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={ring.radius}
                stroke={trackColor}
                strokeWidth={strokeWidth}
                fill="none"
              />
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={ring.radius}
                stroke={colors[i]}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}
