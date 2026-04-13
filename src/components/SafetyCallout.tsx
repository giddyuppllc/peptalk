import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

interface SafetyCalloutProps {
  title?: string;
  subtitle?: string;
}

export const SafetyCallout: React.FC<SafetyCalloutProps> = ({
  title = 'Educational Companion',
  subtitle = 'PepTalk provides educational information only. Always consult your healthcare provider for medical decisions.',
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.glassBlue,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.pepBlue,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2D2D2D',
  },
  subtitle: {
    fontSize: 11,
    color: '#cbd5e1',
    marginTop: 4,
    lineHeight: 16,
  },
});

export default SafetyCallout;
