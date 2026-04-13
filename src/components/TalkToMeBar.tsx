import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Colors,
  Gradients,
  FontSizes,
  Spacing,
  BorderRadius,
} from '../constants/theme';

interface TalkToMeBarProps {
  onPress?: () => void;
  label?: string;
  helperText?: string;
}

export const TalkToMeBar: React.FC<TalkToMeBarProps> = ({
  onPress,
  label = 'Talk to me',
  helperText = 'Ask Aimee anything',
}) => {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Gradient border wrapper */}
      <LinearGradient
        colors={['rgba(59,130,246,0.30)', 'rgba(6,182,212,0.15)', 'rgba(0,0,0,0.05)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.borderGradient}
      >
        <View style={styles.inner}>
          <LinearGradient
            colors={[...Gradients.primary]}
            style={styles.iconContainer}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="chatbubbles-outline" size={18} color="#fff" />
          </LinearGradient>
          <View style={styles.textContainer}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.helper}>{helperText}</Text>
          </View>
          <View style={styles.arrowWrap}>
            <Ionicons
              name="arrow-forward"
              size={16}
              color={Colors.pepBlueLight}
            />
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    shadowColor: Colors.pepBlue,
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  borderGradient: {
    borderRadius: BorderRadius.lg,
    padding: 1,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.darkCard,
    borderRadius: BorderRadius.lg - 1,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    gap: 12,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.darkText,
  },
  helper: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 2,
  },
  arrowWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(59,130,246,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default TalkToMeBar;
