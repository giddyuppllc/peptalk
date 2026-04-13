import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface OptionCardProps {
  label: string;
  description?: string;
  selected?: boolean;
  onPress?: () => void;
}

export const OptionCard: React.FC<OptionCardProps> = ({
  label,
  description,
  selected,
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.content}>
        <Text style={[styles.label, selected && styles.labelSelected]}>
          {label}
        </Text>
        {description ? (
          <Text style={styles.description}>{description}</Text>
        ) : null}
      </View>
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={20}
        color={selected ? '#b9cbb6' : '#6b7280'}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardSelected: {
    backgroundColor: 'rgba(185, 203, 182, 0.15)',
    borderColor: 'rgba(185, 203, 182, 0.4)',
  },
  content: {
    flex: 1,
    marginRight: 12,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D2D2D',
  },
  labelSelected: {
    color: '#b9cbb6',
  },
  description: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
});

export default OptionCard;
