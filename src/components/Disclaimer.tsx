import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SHORT_DISCLAIMER } from '../constants/legal';
import { Colors } from '../constants/theme';

interface DisclaimerProps {
  /** Override the default disclaimer text */
  text?: string;
  /** Variant: 'default' for general, 'dosing' for dosing-specific, 'safety' for safety */
  variant?: 'default' | 'dosing' | 'safety';
}

const VARIANT_TEXT: Record<string, string> = {
  default: SHORT_DISCLAIMER,
  dosing:
    'Dosing information reflects published research protocols and is not a prescription ' +
    'or recommendation. Consult your healthcare provider for all dosing decisions.',
  safety:
    'Safety data may be incomplete. Report any adverse effects to your healthcare ' +
    'provider immediately. This does not replace professional medical assessment.',
};

export const Disclaimer: React.FC<DisclaimerProps> = ({
  text,
  variant = 'default',
}) => {
  const displayText = text ?? VARIANT_TEXT[variant] ?? VARIANT_TEXT.default;

  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons
          name="shield-checkmark-outline"
          size={14}
          color={Colors.pepBlue}
        />
      </View>
      <Text style={styles.text}>{displayText}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.glassBlue,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: `rgba(59, 130, 246, 0.15)`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  text: {
    flex: 1,
    fontSize: 11,
    color: '#6B7280',
    lineHeight: 16,
  },
});

export default Disclaimer;
