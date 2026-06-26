/**
 * PasswordToggle — shared show/hide eye button for password TextInputs.
 *
 * Drop this in next to a password TextInput and drive the field's
 * `secureTextEntry` from the same boolean. Accessibility, a 44×44 tap
 * target (iOS HIG minimum), and hitSlop are baked in so every password
 * field across the app behaves identically.
 *
 *   const [visible, setVisible] = useState(false);
 *   <TextInput secureTextEntry={!visible} ... />
 *   <PasswordToggle visible={visible} onToggle={() => setVisible(v => !v)} />
 */

import React from 'react';
import { TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface PasswordToggleProps {
  /** Whether the password is currently shown in plain text. */
  visible: boolean;
  /** Toggle handler — flip the visibility boolean in the parent. */
  onToggle: () => void;
  /** Icon size. Defaults to 18 to match existing input icons. */
  size?: number;
  /** Icon color. Defaults to a neutral grey (never orange). */
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export function PasswordToggle({
  visible,
  onToggle,
  size = 18,
  color = '#9CA3AF',
  style,
}: PasswordToggleProps) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={[styles.btn, style]}
      activeOpacity={0.7}
      accessible
      accessibilityRole="button"
      accessibilityLabel={visible ? 'Hide password' : 'Show password'}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Ionicons name={visible ? 'eye-off' : 'eye'} size={size} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    // 44×44 minimum tap target per iOS Human Interface Guidelines;
    // hitSlop extends the touch area a further 10pt in each direction.
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
