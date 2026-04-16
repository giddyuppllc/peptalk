import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface SynergyScoreProps {
  score: number;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
}

const getScoreColor = (score: number): string => {
  if (score >= 8) return '#22c55e';
  if (score >= 6) return '#b9cbb6';
  if (score >= 4) return '#FFBF82';
  return '#ef4444';
};

const getScoreLabel = (score: number): string => {
  if (score >= 8) return 'Excellent';
  if (score >= 6) return 'Good';
  if (score >= 4) return 'Moderate';
  return 'Low';
};

const SIZES = {
  small: { circle: 40, font: 16, label: 10 },
  medium: { circle: 56, font: 22, label: 12 },
  large: { circle: 80, font: 32, label: 14 },
};

export const SynergyScore: React.FC<SynergyScoreProps> = ({
  score,
  size = 'medium',
  showLabel = true,
}) => {
  const color = getScoreColor(score);
  const label = getScoreLabel(score);
  const dimensions = SIZES[size];

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.circle,
          {
            width: dimensions.circle,
            height: dimensions.circle,
            borderRadius: dimensions.circle / 2,
            backgroundColor: `${color}20`,
            borderColor: `${color}50`,
          },
        ]}
      >
        <Text
          style={[
            styles.score,
            {
              fontSize: dimensions.font,
              color,
            },
          ]}
        >
          {score}
        </Text>
      </View>
      {showLabel ? (
        <Text
          style={[
            styles.label,
            {
              fontSize: dimensions.label,
              color,
            },
          ]}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  score: {
    fontWeight: '800',
  },
  label: {
    fontWeight: '600',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

export default SynergyScore;
