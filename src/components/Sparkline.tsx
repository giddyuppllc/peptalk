import React from 'react';
import { Text } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

interface SparklineProps {
  data: number[];
  color: string;
  width: number;
  height: number;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  color,
  width,
  height,
}) => {
  if (data.length < 3) {
    return (
      <Text style={{ color: '#6B7280', fontSize: 12, textAlign: 'center' }}>
        Need more data
      </Text>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1; // avoid division by zero
  const padding = range * 0.1;
  const yMin = min - padding;
  const yMax = max + padding;
  const yRange = yMax - yMin;

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - yMin) / yRange) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <Svg width={width} height={height}>
      <Polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
};

export default Sparkline;
