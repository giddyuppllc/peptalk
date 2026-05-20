/**
 * Interactive human body silhouette built with react-native-svg.
 * Tappable regions glow on selection with the region's accent color.
 */

import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, G, Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { tapLight } from '../utils/haptics';
import { useReduceMotion } from '../hooks/useReduceMotion';

const { width: SCREEN_W } = Dimensions.get('window');
const SVG_W = Math.min(SCREEN_W - 48, 300);
const SVG_H = SVG_W * 1.9;

interface BodyModelProps {
  selectedRegion: string | null;
  onSelectRegion: (regionId: string) => void;
  regionColors: Record<string, string>;
}

/** SVG path data for each tappable body zone (front-facing anatomical silhouette) */
const REGION_PATHS: Record<string, { d: string; cx: number; cy: number }> = {
  head: {
    d: 'M135,10 C155,10 172,22 175,45 C178,65 172,80 165,90 C158,98 152,102 150,105 C148,102 142,98 135,90 C128,80 122,65 125,45 C128,22 145,10 135,10 Z',
    cx: 150,
    cy: 55,
  },
  neck: {
    d: 'M140,105 L160,105 L163,130 L137,130 Z',
    cx: 150,
    cy: 118,
  },
  chest: {
    d: 'M100,135 C105,130 130,128 150,128 C170,128 195,130 200,135 L205,175 C205,185 195,195 185,200 L180,200 L150,195 L120,200 L115,200 C105,195 95,185 95,175 Z',
    cx: 150,
    cy: 165,
  },
  shoulders: {
    d: 'M75,135 C85,125 95,128 100,135 L95,175 L75,165 Z M200,135 C215,125 225,128 225,135 L205,175 L225,165 Z',
    cx: 150,
    cy: 145,
  },
  arms: {
    d: 'M70,140 C60,135 50,142 48,155 L38,210 C35,225 38,240 42,255 L50,280 C52,285 56,288 60,285 L65,270 L72,230 L80,190 Z M230,140 C240,135 250,142 252,155 L262,210 C265,225 262,240 258,255 L250,280 C248,285 244,288 240,285 L235,270 L228,230 L220,190 Z',
    cx: 150,
    cy: 215,
  },
  core: {
    d: 'M115,200 L185,200 L188,245 C188,260 185,275 180,285 L150,290 L120,285 C115,275 112,260 112,245 Z',
    cx: 150,
    cy: 245,
  },
  back: {
    d: 'M120,200 L115,200 L112,245 L115,230 L120,215 Z M180,200 L185,200 L188,245 L185,230 L180,215 Z',
    cx: 150,
    cy: 220,
  },
  glutes: {
    d: 'M118,285 L182,285 L185,310 C185,325 175,335 165,338 L150,340 L135,338 C125,335 115,325 115,310 Z',
    cx: 150,
    cy: 312,
  },
  legs: {
    d: 'M115,340 C112,360 108,390 105,420 C102,450 100,480 102,510 C104,530 108,545 115,555 L125,555 C128,545 130,530 132,510 L140,420 L145,370 L150,340 Z M185,340 C188,360 192,390 195,420 C198,450 200,480 198,510 C196,530 192,545 185,555 L175,555 C172,545 170,530 168,510 L160,420 L155,370 L150,340 Z',
    cx: 150,
    cy: 450,
  },
};

export function BodyModel({ selectedRegion, onSelectRegion, regionColors }: BodyModelProps) {
  const pulse = useSharedValue(0.6);
  const reduceMotion = useReduceMotion();

  // 2026-05-17 perf+a11y: cancel worklet on unmount + honor Reduce Motion
  React.useEffect(() => {
    if (reduceMotion) {
      pulse.value = 0.6;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return () => {
      cancelAnimation(pulse);
    };
  }, [pulse, reduceMotion]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.glowBg, pulseStyle]}>
        {selectedRegion && (
          <View
            style={[
              styles.selectedGlow,
              { backgroundColor: regionColors[selectedRegion] || '#E89672' },
            ]}
          />
        )}
      </Animated.View>

      <Svg width={SVG_W} height={SVG_H} viewBox="0 0 300 570" style={styles.svg}>
        <Defs>
          <RadialGradient id="bodyGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#E89672" stopOpacity="0.15" />
            <Stop offset="100%" stopColor="#E89672" stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {/* Background glow */}
        <Circle cx="150" cy="285" r="200" fill="url(#bodyGlow)" />

        {/* Body outline silhouette (non-interactive, behind everything) */}
        <G opacity={0.15}>
          <Path
            d="M150,10 C170,10 180,30 180,55 C180,75 170,95 163,105 L165,130 L225,140 C240,145 255,160 260,180 L270,240 C272,260 265,275 258,285 L250,295 C245,298 240,295 238,290 L225,250 L215,200 L205,180 L200,200 L190,285 L190,320 C190,340 185,345 180,350 L195,420 C200,460 200,500 195,530 C192,545 185,560 175,565 L125,565 C115,560 108,545 105,530 C100,500 100,460 105,420 L120,350 C115,345 110,340 110,320 L110,285 L100,200 L95,180 L85,200 L75,250 L62,290 C60,295 55,298 50,295 L42,285 C35,275 28,260 30,240 L40,180 C45,160 60,145 75,140 L137,130 L135,105 C128,95 120,75 120,55 C120,30 130,10 150,10 Z"
            fill="rgba(0,0,0,0.05)"
            stroke="rgba(0,0,0,0.08)"
            strokeWidth="1"
          />
        </G>

        {/* Tappable regions */}
        {Object.entries(REGION_PATHS).map(([id, { d }]) => {
          const isSelected = selectedRegion === id;
          const color = regionColors[id] || '#E89672';

          return (
            <G key={id}>
              {/* Hit area — slightly larger, invisible */}
              <Path
                d={d}
                fill="transparent"
                stroke="transparent"
                strokeWidth="20"
                onPress={() => {
                  tapLight();
                  onSelectRegion(id);
                }}
              />

              {/* Visible region */}
              <Path
                d={d}
                fill={isSelected ? `${color}40` : 'rgba(0,0,0,0.03)'}
                stroke={isSelected ? color : 'rgba(0,0,0,0.10)'}
                strokeWidth={isSelected ? 2 : 1}
                onPress={() => {
                  tapLight();
                  onSelectRegion(id);
                }}
              />

              {/* Glow dot at center when selected */}
              {isSelected && (
                <Circle
                  cx={REGION_PATHS[id].cx}
                  cy={REGION_PATHS[id].cy}
                  r="6"
                  fill={color}
                  opacity={0.8}
                />
              )}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  svg: {
    zIndex: 2,
  },
  glowBg: {
    position: 'absolute',
    width: SVG_W,
    height: SVG_H,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  selectedGlow: {
    width: 180,
    height: 180,
    borderRadius: 90,
    opacity: 0.15,
    position: 'absolute',
  },
});

export default BodyModel;
