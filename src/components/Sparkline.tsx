import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Polyline, Rect, Circle, Line } from 'react-native-svg';

interface SparklineProps {
  data: number[];
  color: string;
  width: number;
  height: number;
  /** Optional reference range — drawn as a faint horizontal band so a
   *  user can see at a glance whether values are tracking inside the
   *  expected range. Both refLow and refHigh required to render. */
  refLow?: number;
  refHigh?: number;
  /** Render a small dot on the most recent value. Default false (existing
   *  callers don't expect a dot). */
  showLastPoint?: boolean;
  /** Minimum points before we render a chart. Default 3 (legacy). Lab
   *  history may want to render with 2 points. */
  minPoints?: number;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  color,
  width,
  height,
  refLow,
  refHigh,
  showLastPoint = false,
  minPoints = 3,
}) => {
  if (data.length < minPoints) {
    return (
      <Text style={{ color: '#6B7280', fontSize: 12, textAlign: 'center' }}>
        Need more data
      </Text>
    );
  }

  // Fold the reference range into the y-bounds so the line sits visually
  // inside the band rather than being clipped above/below it when values
  // are far from the band.
  const candidates = [...data];
  if (refLow != null) candidates.push(refLow);
  if (refHigh != null) candidates.push(refHigh);
  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  const range = max - min || 1; // avoid division by zero
  const padding = range * 0.1;
  const yMin = min - padding;
  const yMax = max + padding;
  const yRange = yMax - yMin;

  const xFor = (i: number) => (i / (data.length - 1)) * width;
  const yFor = (v: number) => height - ((v - yMin) / yRange) * height;

  const points = data
    .map((value, index) => `${xFor(index)},${yFor(value)}`)
    .join(' ');

  const showBand = refLow != null && refHigh != null && refHigh > refLow;
  const bandTop = showBand ? yFor(refHigh) : 0;
  const bandBottom = showBand ? yFor(refLow) : 0;
  const bandH = showBand ? bandBottom - bandTop : 0;

  const lastX = xFor(data.length - 1);
  const lastY = yFor(data[data.length - 1]);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {showBand && (
          <>
            <Rect x={0} y={bandTop} width={width} height={bandH} fill={color} opacity={0.07} />
            <Line x1={0} x2={width} y1={bandTop} y2={bandTop} stroke={color} strokeWidth={0.5} opacity={0.25} />
            <Line x1={0} x2={width} y1={bandBottom} y2={bandBottom} stroke={color} strokeWidth={0.5} opacity={0.25} />
          </>
        )}
        <Polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {showLastPoint && (
          <Circle cx={lastX} cy={lastY} r={2.5} fill={color} />
        )}
      </Svg>
    </View>
  );
};

export default Sparkline;
